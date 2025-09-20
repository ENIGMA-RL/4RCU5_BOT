import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { musicConfig } from '../../config/configLoader.js';
import { useMainPlayer } from 'discord-player';
import { buildNowPlaying, formatDuration, createButtonCollector } from '../../music/nowPlayingUi.js';
import { loadState, saveState, saveQueue, loadQueue } from '../../music/queueStore.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'play',
  description: 'Play music from YouTube, Spotify, or SoundCloud',
  options: [
    {
      name: 'query',
      type: ApplicationCommandOptionType.String,
      description: 'Song name, artist, or URL to play',
      required: true
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    logger.info(`[play] received query="${interaction.options.getString('query')}" user=${interaction.user.id} guild=${interaction.guild?.id}`);
    
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ You need to be in a voice channel to play music!',
        flags: 64
      });
    }

    logger.debug('[play] deferring reply');
    await interaction.deferReply();
    logger.debug('[play] reply deferred');

    const state = loadState(guild.id);

    const cfg = musicConfig();
    if (cfg.mode === 'lavalink') {
      logger.debug('[play] using lavalink backend');
      const lavalink = interaction.client?.player || interaction.client?.lavalink || interaction.client?.music;
      const voiceChannel = member.voice.channel;
      logger.debug(`[play] lavalink joinAndPlay start vc=${voiceChannel?.id}`);
      const res = await lavalink.joinAndPlay(guild, voiceChannel, interaction.channel, query, interaction.user);
      logger.debug(`[play] lavalink joinAndPlay result ok=${res?.ok} type=${res?.type}`);
      if (!res.ok) {
        return await interaction.editReply({ content: '❌ No tracks found for your search query.' });
      }
      if (res.type === 'PLAYLIST') {
        await interaction.editReply({ content: `✅ Playing **${res.tracks.length}** tracks from playlist!` });
      } else {
        await interaction.editReply({ content: `✅ Playing **${res.track.info?.title || 'track'}**!` });
      }
      return;
    }

    // Fallback: discord-player implementation
    logger.debug('[play] using discord-player backend');
    const player = useMainPlayer();
    logger.debug('[play] searching');
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: 'auto'
    });
    logger.debug(`[play] search complete tracks=${searchResult?.tracks?.length || 0} hasTracks=${searchResult?.hasTracks?.()}`);

    if (!searchResult.hasTracks()) {
      return await interaction.editReply({ content: '❌ No tracks found for your search query.' });
    }

    let node = player.nodes.get(guild.id);
    if (!node) {
      logger.debug('[play] creating node');
      node = player.nodes.create(guild.id, {
        metadata: {
          channel: interaction.channel,
          client: guild.members.me,
          requestedBy: interaction.user
        },
        selfDeaf: false,
        volume: 80,
        leaveOnEnd: false,
        leaveOnStop: false,
        leaveOnEmpty: false
      });
      logger.debug('[play] node created');
    } else if (node.connection && node.connection.voice) {
      node.connection.voice.setSelfDeaf(false);
      logger.debug('[play] reused node, ensured undeafened');
    }

    if (!node.connection) {
      logger.debug(`[play] connecting to voice channel vc=${member.voice.channel?.id}`);
      await node.connect(member.voice.channel);
      if (node.connection && node.connection.voice) {
        await node.connection.voice.setSelfDeaf(false);
        await node.connection.voice.setSelfMute(false);
      }
      logger.debug('[play] connected to voice');
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    logger.trace?.('[play] post-connect settle done');

    node.volume = state.volume;
    logger.debug(`[play] set volume=${state.volume}`);

    const tracks = searchResult.tracks;
    const isPlaylist = searchResult.playlist;

    try {
      if (isPlaylist) {
        logger.debug('[play] playing playlist');
        await node.play(tracks);
        await interaction.editReply({ content: `✅ Playing **${tracks.length}** tracks from **${searchResult.playlist?.title || 'playlist'}**!` });
      } else {
        logger.debug(`[play] playing single title="${tracks[0]?.title}" source=${tracks[0]?.source}`);
        await node.play(tracks[0]);
        await interaction.editReply({ content: `✅ Playing **${tracks[0].title}**!` });
      }
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, '[play] error during node.play');
      return await interaction.editReply({ content: '❌ Failed to play music. Please try again.' });
    }

    try {
      if (node.queue && node.queue.tracks) {
        logger.debug(`[play] saving queue size=${node.queue.tracks.length ?? node.queue.tracks.size ?? 0}`);
        const queueTracks = node.queue.tracks.map(track => ({
          title: track.title,
          url: track.url,
          source: track.source,
          duration: track.duration,
          requestedBy: track.requestedBy,
          thumbnail: track.thumbnail
        }));
        saveQueue(guild.id, queueTracks);
      }
    } catch (error) {
      logger.warn({ err: error }, '[play] could not save queue');
    }

    try {
      const track = node.currentTrack;
      if (track) {
        const queueSize = node.queue?.tracks?.size || 0;
        const nowPlaying = buildNowPlaying(track, state, 0, queueSize);
        const message = await interaction.followUp({
          embeds: [nowPlaying.embed],
          components: nowPlaying.components
        });
        if (message) {
          // Wire button collector for controls if present
          // It expects discord-player
          createButtonCollector(interaction, player, guild.id);
          logger.debug('[play] button collector attached');
        }
      }
    } catch (error) {
      logger.warn({ err: error }, '[play] could not send now playing');
    }

  } catch (error) {
    logger.error({ err: error, userId: interaction?.user?.id, guildId: interaction?.guild?.id }, '[play] unhandled error');
    await interaction.editReply({
      content: '❌ An error occurred while trying to play music.'
    });
  }
};
