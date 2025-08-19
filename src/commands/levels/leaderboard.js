import { createCanvas, loadImage, registerFont } from 'canvas';
import { getTopUsersByType } from '../../features/leveling/levelingSystem.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { channelsConfig, commandCooldownsConfig } from '../../config/configLoader.js';
import { shouldBypassChannelRestrictions } from '../../utils/channelUtils.js';
import { checkCooldown, setCooldown, formatRemainingTime } from '../../utils/cooldownManager.js';
import { getCooldownDuration } from '../../utils/cooldownStorage.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Check cooldown
    const cooldownConfig = commandCooldownsConfig();
    const leaderboardCooldown = cooldownConfig?.commands?.leaderboard;
    
    // Get cooldown duration (prioritize dynamic over config)
    const cooldownDuration = getCooldownDuration('leaderboard');
    
    if (leaderboardCooldown?.enabled && cooldownDuration) {
      const memberRoles = interaction.member.roles.cache.map(role => role.id);
      const cooldownCheck = checkCooldown(
        interaction.user.id, 
        'leaderboard', 
        cooldownDuration, 
        memberRoles
      );
      
      if (cooldownCheck.onCooldown) {
        const remainingTime = formatRemainingTime(cooldownCheck.remainingTime);
        await interaction.reply({
          content: `⏰ You can use this command again in **${remainingTime}**`,
          flags: 64
        });
        return;
      }
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

    // Filter out deleted users and fetch Discord user objects for avatars/usernames
    const textUserInfos = [];
    const voiceUserInfos = [];
    
    // Process text users
    for (const u of textUsers) {
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        textUserInfos.push({ ...u, username: user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) });
      } catch {
        // Skip deleted users - they won't appear in the leaderboard
        continue;
      }
    }
    
    // Process voice users
    for (const u of voiceUsers) {
      try {
        const user = await interaction.client.users.fetch(u.user_id);
        voiceUserInfos.push({ ...u, username: user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) });
      } catch {
        // Skip deleted users - they won't appear in the leaderboard
        continue;
      }
    }

    // Slice for pagination (after filtering deleted users)
    const pagedTextUsers = textUserInfos.slice(offset, offset + pageSize);
    const pagedVoiceUsers = voiceUserInfos.slice(offset, offset + pageSize);

    // Create leaderboard card image
    const buffer = await createLeaderboardCard(pagedTextUsers, pagedVoiceUsers, page);
    await interaction.editReply({
      files: [{ attachment: buffer, name: 'leaderboard.png' }]
    });

    // Set cooldown after successful execution
    if (leaderboardCooldown?.enabled && cooldownDuration) {
      setCooldown(interaction.user.id, 'leaderboard');
    }

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
  
  console.log('Canvas created successfully, dimensions:', canvas.width, 'x', canvas.height);
  
  // Test basic canvas operations
  try {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 10, 10);
    console.log('Basic canvas operations working');
  } catch (error) {
    console.error('Basic canvas operations failed:', error);
  }

  // Load and draw background image (same as rank card)
  const backgroundPath = path.join(__dirname, '../../assets/backgrounds/rank-background.png');
  console.log('Current working directory:', process.cwd());
  console.log('__dirname:', __dirname);
  console.log('Background path resolved to:', backgroundPath);
  console.log('File exists:', fs.existsSync(backgroundPath));
  console.log('File stats:', fs.existsSync(backgroundPath) ? fs.statSync(backgroundPath) : 'File not found');
  
  const background = await loadImage(backgroundPath);
  console.log('Background image loaded successfully, dimensions:', background.width, 'x', background.height);
  ctx.drawImage(background, 0, 0, width, height);
  console.log('Background image drawn to canvas');

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
        try {
          ctx.save();
          ctx.beginPath();
          ctx.arc(col1X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          const avatarImg = await loadImage(user.avatarURL);
          ctx.drawImage(avatarImg, col1X + 20, y, avatarSize, avatarSize);
          ctx.restore();
        } catch (error) {
          console.error('Error loading avatar for user:', user.username, error);
          // Draw a placeholder circle if avatar fails to load
          ctx.restore();
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(col1X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
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
        try {
          ctx.save();
          ctx.beginPath();
          ctx.arc(col2X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          const avatarImg = await loadImage(vuser.avatarURL);
          ctx.drawImage(avatarImg, col2X + 20, y, avatarSize, avatarSize);
          ctx.restore();
        } catch (error) {
          console.error('Error loading avatar for user:', vuser.username, error);
          // Draw a placeholder circle if avatar fails to load
          ctx.restore();
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(col2X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
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