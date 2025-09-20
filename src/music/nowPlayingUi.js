import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import logger from '../utils/logger.js';
import { loadState } from './queueStore.js';

export function progressBar(posMs, durMs, size = 18) {
  const p = Math.max(0, Math.min(1, durMs ? posMs / durMs : 0));
  const filled = Math.round(p * size);
  return "▁".repeat(Math.max(0, size - filled)) + "▮".repeat(filled);
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function getSourceIcon(source) {
  switch (source?.toLowerCase()) {
    case 'youtube': return '📺';
    case 'spotify': return '🎵';
    case 'soundcloud': return '🎧';
    default: return '🎶';
  }
}

export function buildNowPlaying(track, state, queuePosition = 0, queueLength = 0) {
  // Format duration properly
  let duration = 'Unknown';
  if (track.duration) {
    if (typeof track.duration === 'string') {
      // If duration is already a string like "3:45"
      duration = track.duration;
    } else if (track.duration.seconds) {
      // If duration has seconds property
      duration = formatDuration(track.duration.seconds * 1000);
    } else if (typeof track.duration === 'number') {
      // If duration is a number (milliseconds)
      duration = formatDuration(track.duration);
    }
  }

  // Get artist information
  const artist = track.author || track.artist || track.uploader || 'Unknown Artist';
  const title = track.title || 'Unknown Title';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`by **${artist}**`)
    .setURL(track.url)
    .setThumbnail(track.thumbnail || track.thumb)
    .setColor(0x5865F2)
    .addFields(
      { 
        name: "Requested by", 
        value: `<@${track.requestedBy?.id || track.requested_by_id}>`, 
        inline: true 
      },
      { 
        name: "Duration", 
        value: duration, 
        inline: true 
      },
      { 
        name: "Source", 
        value: `${getSourceIcon(track.source)} ${track.source || 'Unknown'}`, 
        inline: true 
      },
      { 
        name: "Loop", 
        value: state.loop_mode || "off", 
        inline: true 
      },
      { 
        name: "Autoplay", 
        value: state.autoplay ? "on" : "off", 
        inline: true 
      },
      { 
        name: "Volume", 
        value: `${state.volume || 100}%`, 
        inline: true 
      }
    )
    .setFooter({ 
      text: `Track ${queuePosition + 1} of ${queueLength} • ${getSourceIcon(track.source)} ${track.source || 'Unknown'}` 
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music:back")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏮")
      .setDisabled(queuePosition === 0),
    new ButtonBuilder()
      .setCustomId("music:pause")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏯"),
    new ButtonBuilder()
      .setCustomId("music:skip")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭")
      .setDisabled(queuePosition >= queueLength - 1),
    new ButtonBuilder()
      .setCustomId("music:loop")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔁"),
    new ButtonBuilder()
      .setCustomId("music:stop")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⏹")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music:shuffle")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔀"),
    new ButtonBuilder()
      .setCustomId("music:queue")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId("music:autoplay")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🎲")
      .setLabel(state.autoplay ? "Autoplay ON" : "Autoplay OFF")
  );

  return { embed, components: [row, row2] };
}

export function buildQueueEmbed(tracks, currentPosition = 0, page = 0) {
  const tracksPerPage = 10;
  const startIndex = page * tracksPerPage;
  const endIndex = Math.min(startIndex + tracksPerPage, tracks.length);
  const pageTracks = tracks.slice(startIndex, endIndex);
  
  const embed = new EmbedBuilder()
    .setTitle(`Queue (${tracks.length} tracks)`)
    .setColor(0x5865F2)
    .setTimestamp();

  if (pageTracks.length === 0) {
    embed.setDescription("Queue is empty");
    return embed;
  }

  const queueText = pageTracks.map((track, index) => {
    const actualIndex = startIndex + index;
    const isCurrent = actualIndex === currentPosition;
    const prefix = isCurrent ? "▶️" : `${actualIndex + 1}.`;
    const duration = track.duration_ms ? formatDuration(track.duration_ms) : 'Unknown';
    
    return `${prefix} **${track.title}** (${duration}) - <@${track.requested_by_id}>`;
  }).join('\n');

  embed.setDescription(queueText);
  
  if (tracks.length > tracksPerPage) {
    embed.setFooter({ 
      text: `Page ${page + 1} of ${Math.ceil(tracks.length / tracksPerPage)}` 
    });
  }

  return embed;
}

export function createButtonCollector(interaction, player, guildId, timeout = 300000) {
  const filter = (i) => {
    return i.user.id === interaction.user.id && i.customId.startsWith('music:');
  };

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: timeout,
    max: 100
  });

  collector.on('collect', async (buttonInteraction) => {
    try {
      logger.info(`Button interaction received: ${buttonInteraction.customId} from user ${buttonInteraction.user.id}`);
      await buttonInteraction.deferUpdate();
      
      const action = buttonInteraction.customId.split(':')[1];
      logger.info(`Button action: ${action}`);
      const node = player.nodes.get(guildId);
      const queue = player.queues.get(guildId) || player.nodes.get(guildId);
      logger.info(`Node found: ${!!node}, Guild ID: ${guildId}`);
      
      if (!node) {
        logger.warn('No node found for button interaction');
        await buttonInteraction.followUp({ 
          content: '❌ No music is currently playing.', 
          ephemeral: true 
        });
        return;
      }


      switch (action) {
        case 'back':
          if (queue?.history?.size > 0 && queue?.history?.back) {
            queue.history.back();
          }
          break;
          
        case 'pause':
          try {
            const qp = queue?.node || node;
            if (!qp) throw new Error('Queue/Node not available');
            if (qp.isPaused && qp.isPaused()) {
              qp.resume();
              await buttonInteraction.followUp({ content: '▶️ Resumed music!', ephemeral: true });
            } else if (qp.pause) {
              qp.pause();
              await buttonInteraction.followUp({ content: '⏸️ Paused music!', ephemeral: true });
            }
            await updateNowPlayingEmbed(buttonInteraction, qp, player, guildId);
          } catch (error) {
            logger.error({ err: error }, 'Error in pause button');
            await buttonInteraction.followUp({ content: '❌ Error pausing music!', ephemeral: true });
          }
          break;
          
        case 'skip':
          try {
            const qp = queue?.node || node;
            if (qp?.skip) {
              qp.skip();
              await buttonInteraction.followUp({ content: '⏭️ Skipped to next track!', ephemeral: true });
            }
          } catch (error) {
            logger.error({ err: error }, 'Error in skip button');
            await buttonInteraction.followUp({ content: '❌ Error skipping music!', ephemeral: true });
          }
          break;
          
        case 'loop':
          try {
            const q = player.queues.get(guildId) || node?.queue;
            const currentMode = q?.repeatMode ?? 0;
            const newMode = currentMode === 0 ? 1 : currentMode === 1 ? 2 : 0;
            if (q?.setRepeatMode) q.setRepeatMode(newMode);
            const modeText = newMode === 0 ? 'off' : newMode === 1 ? 'track' : 'queue';
            await buttonInteraction.followUp({ content: `🔁 Loop set to ${modeText}!`, ephemeral: true });
            await updateNowPlayingEmbed(buttonInteraction, node, player, guildId);
          } catch (error) {
            logger.error({ err: error }, 'Error in loop button');
            await buttonInteraction.followUp({ content: '❌ Error setting loop!', ephemeral: true });
          }
          break;
          
        case 'stop':
          try {
            if (node.delete) {
              node.delete();
              await buttonInteraction.followUp({ content: '⏹️ Stopped music!', ephemeral: true });
            }
          } catch (error) {
            logger.error({ err: error }, 'Error in stop button');
            await buttonInteraction.followUp({ content: '❌ Error stopping music!', ephemeral: true });
          }
          break;
          
        case 'shuffle':
          try {
            const q = player.queues.get(guildId) || node?.queue;
            if (q?.tracks?.shuffle) {
              q.tracks.shuffle();
              await buttonInteraction.followUp({ content: '🔀 Shuffled queue!', ephemeral: true });
            }
          } catch (error) {
            logger.error({ err: error }, 'Error in shuffle button');
            await buttonInteraction.followUp({ content: '❌ Error shuffling queue!', ephemeral: true });
          }
          break;
          
        case 'queue':
          try {
            const q = player.queues.get(guildId) || node?.queue;
            const queueSize = q?.tracks?.size || 0;
            await buttonInteraction.followUp({ 
              content: `📋 Queue has ${queueSize} tracks. Use \`/queue\` command for full details!`, 
              ephemeral: true 
            });
          } catch (error) {
            logger.error({ err: error }, 'Error in queue button');
            await buttonInteraction.followUp({ content: '❌ Error showing queue!', ephemeral: true });
          }
          break;
          
        case 'autoplay':
          try {
            // Toggle autoplay
            const currentAutoplay = node.autoplay;
            node.autoplay = !currentAutoplay;
            await buttonInteraction.followUp({ 
              content: `🎵 Autoplay ${!currentAutoplay ? 'enabled' : 'disabled'}!`, 
              ephemeral: true 
            });
          } catch (error) {
            logger.error({ err: error }, 'Error in autoplay button');
            await buttonInteraction.followUp({ content: '❌ Error toggling autoplay!', ephemeral: true });
          }
          break;
      }
      
    } catch (error) {
      logger.error({ err: error }, 'Error handling button interaction');
      await buttonInteraction.followUp({ 
        content: '❌ An error occurred while processing your request.', 
        ephemeral: true 
      });
    }
  });

  collector.on('end', () => {
    logger.debug('Button collector ended');
  });

  return collector;
}

// Function to update the now playing embed
async function updateNowPlayingEmbed(interaction, node, player, guildId) {
  try {
    const state = loadState(guildId);
    const track = node.currentTrack;
    if (track) {
      const queueSize = node.queue?.tracks?.size || 0;
      const nowPlaying = buildNowPlaying(track, state, 0, queueSize);
      await interaction.message.edit({
        embeds: [nowPlaying.embed],
        components: nowPlaying.components
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating now playing embed');
  }
}
