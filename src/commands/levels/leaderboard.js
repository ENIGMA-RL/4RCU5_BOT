import { createCanvas, loadImage, registerFont } from 'canvas';
import { getTopUsersByType } from '../../features/leveling/levelingSystem.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { channelsConfig, commandCooldownsConfig } from '../../config/configLoader.js';
import { shouldBypassChannelRestrictions } from '../../utils/channelUtils.js';
import { check as cdCheck, set as cdSet, formatRemaining as cdFormat } from '../../services/CooldownService.js';
import logger from '../../utils/logger.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple cache for guild members to avoid repeated fetches
const memberCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to get cached user data
function getCachedMember(userId) {
  const cached = memberCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.member;
  }
  return null;
}

// Helper function to cache user data
function cacheMember(userId, member) {
  memberCache.set(userId, { member, timestamp: Date.now() });
}

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
    if (leaderboardCooldown?.enabled) {
      const res = cdCheck(interaction.member, 'leaderboard');
      if (res.onCooldown) {
        const remaining = cdFormat(res.remainingTime);
        await interaction.reply({ content: `⏰ You can use this command again in **${remaining}**`, flags: 64 });
        return;
      }
    }

    await interaction.deferReply();
    deferred = true;

    // Get page argument
    const page = interaction.options.getInteger('page') || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    // Get users once and sort for both columns
    const allUsers = await getTopUsersByType('total', 1000);
    const textUsers = [...allUsers].sort((a, b) => b.xp - a.xp);
    const voiceUsers = [...allUsers].sort((a, b) => b.voice_xp - a.voice_xp);

    // Determine only the users needed for the requested page
    const pagedTextRaw = textUsers.slice(offset, offset + pageSize);
    const pagedVoiceRaw = voiceUsers.slice(offset, offset + pageSize);

    // Extract only user IDs for current page (deduped)
    const allUserIds = [...new Set([...pagedTextRaw.map(u => u.user_id), ...pagedVoiceRaw.map(u => u.user_id)])];
    
    logger.debug(`Processing ${textUsers.length} text users and ${voiceUsers.length} voice users (${allUserIds.length} unique users)`);
    
    // Check cache first and only fetch uncached members
    const uncachedIds = [];
    const cachedMembers = new Map();
    
    for (const userId of allUserIds) {
      const cached = getCachedMember(userId);
      if (cached) {
        cachedMembers.set(userId, cached);
      } else {
        uncachedIds.push(userId);
      }
    }
    
    logger.debug(`Using ${cachedMembers.size} cached members, fetching ${uncachedIds.length} new members`);
    
    // Batch fetch only uncached members from Discord API
    let newUsers = [];
    if (uncachedIds.length > 0) {
      newUsers = await Promise.all(
        uncachedIds.map(id => interaction.guild.members.fetch(id).catch(() => null))
      );
      
      // Cache the newly fetched members
      newUsers.forEach((member, index) => {
        if (member) {
          const userId = uncachedIds[index];
          cacheMember(userId, member);
          cachedMembers.set(userId, member);
        }
      });
    }
    
    // Create a map for fast member lookup (combines cached and new)
    const userMap = cachedMembers;
    
    // Process only current page users
    const textUserInfos = await processTextUsers(pagedTextRaw, userMap);
    const voiceUserInfos = await processVoiceUsers(pagedVoiceRaw, userMap);
    
    logger.debug(`After processing: ${textUserInfos.length} text users, ${voiceUserInfos.length} voice users`);
    logger.debug(`Page ${page}: ${textUserInfos.length} text users, ${voiceUserInfos.length} voice users`);

    // Ensure we have enough users for the page
    if (textUserInfos.length === 0 && voiceUserInfos.length === 0) {
      await interaction.editReply({
        content: '❌ No users found for this page. The leaderboard may be empty or all users on this page have been deleted.'
      });
      return;
    }

    // Create leaderboard card image
    const buffer = await createLeaderboardCard(textUserInfos, voiceUserInfos, page);
    await interaction.editReply({
      files: [{ attachment: buffer, name: 'leaderboard.png' }]
    });

    // Set cooldown after successful execution
    if (leaderboardCooldown?.enabled) {
      cdSet(interaction.member, 'leaderboard');
    }

  } catch (error) {
    logger.error({ err: error }, 'Error in leaderboard command');
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
      logger.error({ err }, 'Failed to send error reply');
    }
  }
};

// Helper function to process text users efficiently
async function processTextUsers(textUsers, userMap) {
  const textUserInfos = [];
  
  for (const u of textUsers) {
    const member = userMap.get(u.user_id);
    if (!member) {
      logger.debug(`Skipping non-member text user: ${u.user_id}`);
      continue;
    }
    
    // Add user to the list (database already filtered out users who left)
    textUserInfos.push({ 
      ...u, 
      username: member.displayName || member.user.username, 
      avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 128 })
    });
    logger.debug(`Text user: ${member.displayName || member.user.username} (${u.user_id})`);
  }
  
  return textUserInfos;
}

// Helper function to process voice users efficiently
async function processVoiceUsers(voiceUsers, userMap) {
  const voiceUserInfos = [];
  
  for (const u of voiceUsers) {
    const member = userMap.get(u.user_id);
    if (!member) {
      logger.debug(`Skipping non-member voice user: ${u.user_id}`);
      continue;
    }
    
    // Add user to the list (database already filtered out users who left)
    voiceUserInfos.push({ 
      ...u, 
      username: member.displayName || member.user.username, 
      avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 128 })
    });
    logger.debug(`Voice user: ${member.displayName || member.user.username} (${u.user_id})`);
  }
  
  return voiceUserInfos;
}

async function createLeaderboardCard(textUsers, voiceUsers, page) {
  logger.trace('createLeaderboardCard called with', { textCount: textUsers.length, voiceCount: voiceUsers.length, page });
  
  const width = 900;
  const height = 856;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  logger.trace('Canvas created successfully', { width: canvas.width, height: canvas.height });
  
  // Test basic canvas operations
  try {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 10, 10);
    logger.trace('Basic canvas operations working');
  } catch (error) {
    logger.error({ err: error }, 'Basic canvas operations failed');
  }

  // Load and draw background image (same as rank card)
  const backgroundPath = path.join(__dirname, '../../assets/backgrounds/rank-background.png');
  logger.trace('Background path info', { cwd: process.cwd(), __dirname, backgroundPath, exists: fs.existsSync(backgroundPath) });
  
  const background = await loadImage(backgroundPath);
  logger.trace('Background image loaded', { width: background.width, height: background.height });
  ctx.drawImage(background, 0, 0, width, height);
  logger.trace('Background image drawn to canvas');

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
          logger.error({ err: error, username: user.username }, 'Error loading avatar for text user');
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
      ctx.fillStyle = '#fff'; // All users shown are active members
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
          logger.error({ err: error, username: vuser.username }, 'Error loading avatar for voice user');
          // Draw a placeholder circle if avatar fails to load
          ctx.restore();
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(col2X + 38, y + 18, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.font = 'bold 18px Montserrat, Arial';
      ctx.fillStyle = '#fff'; // All users shown are active members
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