import { EmbedBuilder } from 'discord.js';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { getUserLevelData } from '../../features/leveling/levelingSystem.js';
import { getTopUsersByType } from '../../features/leveling/levelingSystem.js';
import fs from 'fs';
import { channelsConfig } from '../../config/configLoader.js';
import { shouldBypassChannelRestrictions } from '../../utils/channelUtils.js';

export const data = {
  name: 'leaderboard',
  description: 'View CNS leaderboard',
  options: [
    {
      name: 'page',
      type: 4, // INTEGER
      description: 'Page number (10 users per page)',
      required: false,
      min_value: 1
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  let deferred = false;
  try {
    // Channel restriction (bypassed in bot test channel)
    if (!shouldBypassChannelRestrictions(interaction.channelId) && interaction.channelId !== channelsConfig().levelCheckChannelId) {
      await interaction.reply({
        content: `❌ This command can only be used in <#${channelsConfig().levelCheckChannelId}>`,
        flags: 64
      });
      return;
    }

    await interaction.deferReply();
    deferred = true;

    // Get page argument
    const page = interaction.options.getInteger('page') || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    // Get all users for both text and voice
    const textUsers = await getTopUsersByType('message', 1000); // get all, will slice below
    const voiceUsers = await getTopUsersByType('voice', 1000);

    // Slice for pagination
    const pagedTextUsers = textUsers.slice(offset, offset + pageSize);
    const pagedVoiceUsers = voiceUsers.slice(offset, offset + pageSize);

    // Fetch Discord user objects for avatars/usernames
    const textUserInfos = await Promise.all(pagedTextUsers.map(async (u) => {
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        return { ...u, username: user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) };
      } catch {
        return { ...u, username: u.user_id, avatarURL: null };
      }
    }));
    const voiceUserInfos = await Promise.all(pagedVoiceUsers.map(async (u) => {
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        return { ...u, username: user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) };
      } catch {
        return { ...u, username: u.user_id, avatarURL: null };
      }
    }));

    // Create leaderboard card image
    const buffer = await createLeaderboardCard(textUserInfos, voiceUserInfos, page);
    await interaction.editReply({
      files: [{ attachment: buffer, name: 'leaderboard.png' }]
    });

  } catch (error) {
    console.error('Error in leaderboard command:', error);
    try {
      if (interaction.replied || interaction.deferred || deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while generating the leaderboard.'
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while generating the leaderboard.',
          flags: 64
        });
      }
    } catch (err) {
      // If we can't reply, just log
      console.error('Failed to send error reply:', err);
    }
  }
};

async function createLeaderboardCard(textUsers, voiceUsers, page) {
  const width = 900;
  const height = 856;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Load and draw background image (same as rank card)
  const backgroundPath = './src/assets/backgrounds/rank-background.png';
  if (fs.existsSync(backgroundPath)) {
    const background = await loadImage(backgroundPath);
    ctx.drawImage(background, 0, 0, width, height);
  }

  // Card settings
  const cardX = 40;
  const cardY = 60;
  const cardW = width - 80;
  const cardH = height - 120;
  const cardRadius = 32;

  // Draw card
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(cardX + cardRadius, cardY);
  ctx.lineTo(cardX + cardW - cardRadius, cardY);
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cardRadius);
  ctx.lineTo(cardX + cardW, cardY + cardH - cardRadius);
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cardRadius, cardY + cardH);
  ctx.lineTo(cardX + cardRadius, cardY + cardH);
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cardRadius);
  ctx.lineTo(cardX, cardY + cardRadius);
  ctx.quadraticCurveTo(cardX, cardY, cardX + cardRadius, cardY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20, 20, 30, 0.5)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(196, 63, 255, 0.25)';
  ctx.stroke();
  ctx.restore();

  // Header
  ctx.font = 'bold 44px Montserrat, Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('CNS LEADERBOARD', width / 2, cardY + 54);

  // Column settings
  const colW = (cardW - 60) / 2;
  const col1X = cardX + 40;
  const col2X = cardX + colW + 60;
  const startY = cardY + 110;
  const rowH = 52;
  const avatarSize = 36;

  // Column titles
  ctx.font = 'bold 24px Montserrat, Arial';
  ctx.fillStyle = '#ff7bac';
  ctx.textAlign = 'left';
  ctx.fillText('💬 MESSAGE XP', col1X, startY);
  ctx.fillStyle = '#3ecbff';
  ctx.fillText('🎤 VOICE XP', col2X, startY);

  // Draw rows
  for (let i = 0; i < 10; i++) {
    const y = startY + 36 + i * rowH;
    // Text XP column
    const user = textUsers[i];
    if (user) {
      // Rank number
      ctx.font = 'bold 20px Montserrat, Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(`#${(page - 1) * 10 + i + 1}`, col1X + 12, y + 28);
      // Avatar
      if (user.avatarURL) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(col1X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const avatarImg = await loadImage(user.avatarURL);
        ctx.drawImage(avatarImg, col1X + 20, y, avatarSize, avatarSize);
        ctx.restore();
      }
      // Username
      ctx.font = 'bold 18px Montserrat, Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(user.username, col1X + 68, y + 28);
      // XP
      ctx.font = 'bold 18px Montserrat, Arial';
      ctx.fillStyle = '#ff7bac';
      ctx.textAlign = 'right';
      ctx.fillText(`XP: ${user.xp}`, col1X + colW - 16, y + 28);
    }
    // Voice XP column
    const vuser = voiceUsers[i];
    if (vuser) {
      ctx.font = 'bold 20px Montserrat, Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(`#${(page - 1) * 10 + i + 1}`, col2X + 12, y + 28);
      if (vuser.avatarURL) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(col2X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const avatarImg = await loadImage(vuser.avatarURL);
        ctx.drawImage(avatarImg, col2X + 20, y, avatarSize, avatarSize);
        ctx.restore();
      }
      ctx.font = 'bold 18px Montserrat, Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(vuser.username, col2X + 68, y + 28);
      ctx.font = 'bold 18px Montserrat, Arial';
      ctx.fillStyle = '#3ecbff';
      ctx.textAlign = 'right';
      ctx.fillText(`XP: ${vuser.voice_xp}`, col2X + colW - 16, y + 28);
    }
  }

  // Footer: show page number
  ctx.font = '16px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  ctx.textAlign = 'center';
  ctx.fillText(`Page ${page}`, width / 2, cardY + cardH - 18);

  return canvas.toBuffer('image/png');
} 