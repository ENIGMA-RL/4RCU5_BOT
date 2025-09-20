import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { buildNowPlaying } from '../../music/nowPlayingUi.js';
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
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ You need to be in a voice channel to play music!',
        flags: 64
      });
    }

    await interaction.deferReply();

    const player = useMainPlayer();
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: 'auto'
    });

    if (!searchResult.hasTracks()) {
      return await interaction.editReply({
        content: '❌ No tracks found for your search query.'
      });
    }

    // Get or create player node
    let node = player.nodes.get(guild.id);
    if (!node) {
      node = player.nodes.create(guild.id, {
        metadata: {
          channel: interaction.channel,
          client: guild.members.me,
          requestedBy: interaction.user
        },
        selfDeaf: true,
        volume: 80,
        leaveOnEnd: false,
        leaveOnStop: false,
        leaveOnEmpty: false
      });
    }

    // Connect to voice channel
    if (!node.connection) {
      await node.connect(member.voice.channel);
    }

    // Load guild state
    const state = loadState(guild.id);
    node.setVolume(state.volume);

    // Add tracks to queue
    const tracks = searchResult.tracks;
    const isPlaylist = searchResult.playlist;
    
    if (isPlaylist) {
      node.queue.addTrack(tracks);
      await interaction.editReply({
        content: `✅ Added **${tracks.length}** tracks from **${searchResult.playlist?.title || 'playlist'}** to the queue!`
      });
    } else {
      node.queue.addTrack(tracks[0]);
      await interaction.editReply({
        content: `✅ Added **${tracks[0].title}** to the queue!`
      });
    }

    // Save queue to database
    const queueTracks = node.queue.tracks.map(track => ({
      title: track.title,
      url: track.url,
      source: track.source,
      duration: track.duration,
      requestedBy: track.requestedBy,
      thumbnail: track.thumbnail
    }));
    saveQueue(guild.id, queueTracks);

    // Start playing if not already playing
    if (!node.isPlaying()) {
      await node.play();
    }

    // Send now playing embed for current track
    if (node.currentTrack) {
      const nowPlaying = buildNowPlaying(node.currentTrack, state, 0, node.queue.tracks.size);
      await interaction.followUp({
        embeds: [nowPlaying.embed],
        components: nowPlaying.components
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Error in play command');
    await interaction.editReply({
      content: '❌ An error occurred while trying to play music.'
    });
  }
};
