import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
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
    logger.info(`Play command received: ${interaction.options.getString('query')} from ${interaction.user.id}`);
    
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const guild = interaction.guild;

    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ You need to be in a voice channel to play music!',
        flags: 64
      });
    }

    logger.info('Deferring reply...');
    await interaction.deferReply();
    logger.info('Reply deferred successfully');

    const player = useMainPlayer();
    logger.info('Starting music search...');
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: 'auto'
    });
    logger.info(`Search completed: ${searchResult.tracks.length} tracks found`);

    if (!searchResult.hasTracks()) {
      return await interaction.editReply({
        content: '❌ No tracks found for your search query.'
      });
    }

    // Get or create player node
    logger.info('Getting or creating node...');
    let node = player.nodes.get(guild.id);
    if (!node) {
      logger.info('Creating new node...');
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
      logger.info('Node created successfully');
    } else {
      logger.info('Using existing node');
      // Ensure the existing node is not deafened
      if (node.connection && node.connection.voice) {
        node.connection.voice.setSelfDeaf(false);
        logger.info('Set existing node to not deafened');
      }
    }
    
    // Force unmute the bot after connection
    if (node.connection && node.connection.voice) {
      await node.connection.voice.setSelfDeaf(false);
      await node.connection.voice.setSelfMute(false);
      logger.info('Forced bot to be unmuted and undeafened');
    }

    // Connect to voice channel
    if (!node.connection) {
      logger.info('Connecting to voice channel...');
      await node.connect(member.voice.channel);
      logger.info('Connected to voice channel successfully');
      
      // Force unmute after connection
      if (node.connection && node.connection.voice) {
        await node.connection.voice.setSelfDeaf(false);
        await node.connection.voice.setSelfMute(false);
        logger.info('Forced bot to be unmuted and undeafened after connection');
      }
    } else {
      logger.info('Already connected to voice channel');
    }

    // Wait a moment for the node to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));

    // Load guild state
    const state = loadState(guild.id);
    node.volume = state.volume;

    // Add tracks to queue
    const tracks = searchResult.tracks;
    const isPlaylist = searchResult.playlist;
    
    // Play the tracks directly
    try {
      logger.info('Starting to play tracks...');
      if (isPlaylist) {
        logger.info('Playing playlist...');
        await node.play(tracks);
        logger.info('Playlist started, sending reply...');
        await interaction.editReply({
          content: `✅ Playing **${tracks.length}** tracks from **${searchResult.playlist?.title || 'playlist'}**!`
        });
        logger.info('Playlist reply sent');
      } else {
        logger.info('Playing single track...');
        logger.info(`Track details: Title="${tracks[0].title}", Artist="${tracks[0].author}", URL="${tracks[0].url}"`);
        logger.info(`Track source: ${tracks[0].source}, Duration: ${tracks[0].duration}`);
        await node.play(tracks[0]);
        logger.info('Single track started, sending reply...');
        await interaction.editReply({
          content: `✅ Playing **${tracks[0].title}**!`
        });
        logger.info('Single track reply sent');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error playing tracks');
      return await interaction.editReply({
        content: '❌ Failed to play music. Please try again.'
      });
    }

    // Save queue to database (if queue is available)
    try {
      if (node.queue && node.queue.tracks) {
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
      logger.warn({ err: error }, 'Could not save queue to database');
    }

    // The tracks should start playing automatically when added to the queue

    // Send now playing embed with full UI
    try {
      const track = node.currentTrack;
      if (track) {
        const queueSize = node.queue?.tracks?.size || 0;
        const nowPlaying = buildNowPlaying(track, state, 0, queueSize);
        const message = await interaction.followUp({
          embeds: [nowPlaying.embed],
          components: nowPlaying.components
        });
        
        // Create button collector for interactions
        if (message) {
          createButtonCollector(interaction, player, guild.id);
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not send now playing embed');
    }

  } catch (error) {
    logger.error({ err: error }, 'Error in play command');
    await interaction.editReply({
      content: '❌ An error occurred while trying to play music.'
    });
  }
};
