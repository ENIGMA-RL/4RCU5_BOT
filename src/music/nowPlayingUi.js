import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import logger from '../utils/logger.js';

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
  const embed = new EmbedBuilder()
    .setTitle(track.title)
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
        value: track.duration ? formatDuration(track.duration.seconds * 1000) : 'Unknown', 
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
      await buttonInteraction.deferUpdate();
      
      const action = buttonInteraction.customId.split(':')[1];
      const node = player.nodes.get(guildId);
      
      if (!node) {
        await buttonInteraction.followUp({ 
          content: '❌ No music is currently playing.', 
          ephemeral: true 
        });
        return;
      }

      switch (action) {
        case 'back':
          if (node.queue.history.size > 0) {
            node.history.back();
          }
          break;
          
        case 'pause':
          if (node.isPaused()) {
            node.resume();
          } else {
            node.pause();
          }
          break;
          
        case 'skip':
          node.skip();
          break;
          
        case 'loop':
          const currentMode = node.repeatMode;
          const newMode = currentMode === 0 ? 1 : currentMode === 1 ? 2 : 0;
          node.setRepeatMode(newMode);
          break;
          
        case 'stop':
          node.stop();
          break;
          
        case 'shuffle':
          node.queue.tracks.shuffle();
          break;
          
        case 'queue':
          // Show queue - this would need to be implemented
          break;
          
        case 'autoplay':
          // Toggle autoplay - this would need to be implemented
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
