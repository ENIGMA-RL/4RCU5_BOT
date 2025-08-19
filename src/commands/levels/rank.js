// Imports and setup
import { ApplicationCommandOptionType, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { getUserLevelData } from '../../features/leveling/levelingSystem.js';
import { getUserRank } from '../../database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { channelsConfig, commandCooldownsConfig, levelSettingsConfig } from '../../config/configLoader.js';
import { shouldBypassChannelRestrictions as bypassCheck } from '../../utils/channelUtils.js';
import { checkCooldown, setCooldown, formatRemainingTime } from '../../utils/cooldownManager.js';
import { getCooldownDuration } from '../../utils/cooldownStorage.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = {
  name: 'rank',
  description: "Show your or another user's rank card",
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to show the rank for (optional)',
      required: false,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Channel restriction (bypassed in bot test channel)
    if (!bypassCheck(interaction.channelId) && interaction.channelId !== channelsConfig().levelCheckChannelId) {
      await interaction.reply({
        content: `❌ This command can only be used in <#${channelsConfig().levelCheckChannelId}>`,
        flags: 64
      });
      return;
    }

    // Check cooldown
    const cooldownConfig = commandCooldownsConfig();
    const rankCooldown = cooldownConfig?.commands?.rank;
    
    // Get cooldown duration (prioritize dynamic over config)
    const cooldownDuration = getCooldownDuration('rank');
    
    if (rankCooldown?.enabled && cooldownDuration) {
      const memberRoles = interaction.member.roles.cache.map(role => role.id);
      const cooldownCheck = checkCooldown(
        interaction.user.id, 
        'rank', 
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

    // Defer reply
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    
    // Get user data
    const userData = await getUserLevelData(userId);
    if (!userData) {
      await interaction.editReply({ content: '❌ User not found in the leveling system.' });
      return;
    }

    // Get server rank
    const serverRank = getUserRank(userId);
    
    // Load level settings
    const levelSettings = levelSettingsConfig();
    if (!levelSettings?.leveling?.xpThresholds) {
      await interaction.editReply({ content: '❌ Level config is missing or invalid.' });
      return;
    }

    const xpThresholds = levelSettings.leveling.xpThresholds;
    
    // Register custom font (Montserrat) if available
    try {
      registerFont(path.join(__dirname, '../../assets/fonts/Montserrat-Bold.ttf'), { family: 'Montserrat', weight: 'bold' });
    } catch (e) {}

    // Create rank card
    const rankCardBuffer = await createRankCard(targetUser, userData, serverRank, xpThresholds);
    const attachment = new AttachmentBuilder(rankCardBuffer, { name: 'rank.png' });
    
    // Send the response
    await interaction.editReply({ files: [attachment] });

    // Set cooldown after successful execution
    if (rankCooldown?.enabled && cooldownDuration) {
      setCooldown(interaction.user.id, 'rank');
    }

  } catch (error) {
    console.error('Error in rank command:', error);
    try {
      fs.appendFileSync('./rank-error.log', `[${new Date().toISOString()}] ${error.stack || error}\n`);
    } catch (logErr) {
      console.error('Failed to write to rank-error.log:', logErr);
    }
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ There was an error while executing this command.' });
      } else {
        await interaction.reply({ content: '❌ There was an error while executing this command.', flags: 64 });
      }
    } catch (replyError) {
      console.error('Error sending error reply:', replyError);
    }
  }
};

async function createRankCard(user, userData, serverRank, xpThresholds) {
  // Declare these at the top to avoid ReferenceError
  let totalLevel = 0;
  let prevThreshold = 0;
  let nextThreshold = 0;
  const levels = Object.keys(xpThresholds).map(Number).sort((a, b) => a - b);

  const width = 800;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw background
  const backgroundPath = path.join(__dirname, '../../assets/backgrounds/rank-background.png');
  if (fs.existsSync(backgroundPath)) {
    try {
      const background = await loadImage(backgroundPath);
      ctx.drawImage(background, 0, 0, width, height);
    } catch (error) {
      console.error('Error loading background:', error);
    }
  }

  // Card and avatar settings
  const avatarSize = 100;
  const cardW = 620;
  const cardH = 330;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;
  const avatarX = cardX - avatarSize / 2;
  const avatarY = cardY - 40;
  const cardRadius = 28;
  const cardPaddingX = 72;
  const cardPaddingY = 42;

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
  ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(196, 63, 255, 0.25)';
  ctx.stroke();
  ctx.restore();

  // Draw CNS-ascii logo in top right of card
  try {
    const asciiLogo = await loadImage(path.join(__dirname, '../../assets/images/cns-ascii.png'));
    const logoWidth = 210;
    const logoHeight = asciiLogo.height * (logoWidth / asciiLogo.width);
    const logoX = cardX + cardW - logoWidth - 32;
    const logoY = cardY + 32;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(asciiLogo, logoX, logoY, logoWidth, logoHeight);
    ctx.globalAlpha = 1.0;
  } catch (e) {
    console.error('Error loading CNS-ascii logo:', e);
  }

  // Draw avatar
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch (error) {
    console.error('Error loading avatar:', error);
  }

  // User info section
  const textStartX = cardX + cardPaddingX;
  let y = cardY + cardPaddingY + 8;
  ctx.font = 'bold 32px Montserrat, Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(user.username, textStartX, y);

  // Calculate total level and thresholds
  const totalXP = (userData.xp || 0) + (userData.voice_xp || 0);
  for (let i = 0; i < levels.length; i++) {
    if (totalXP >= xpThresholds[levels[i]]) {
      totalLevel = levels[i];
      prevThreshold = xpThresholds[levels[i]];
      nextThreshold = xpThresholds[levels[i + 1]] || prevThreshold + 100;
    } else {
      break;
    }
  }

  // Show levelUpRole title below username if available
  const levelUpRoles = levelSettingsConfig().leveling.levelUpRoles;
  let bestTitle = null;
  let bestLevel = 0;
  for (const key of Object.keys(levelUpRoles).map(Number).sort((a, b) => a - b)) {
    if (typeof totalLevel !== 'undefined' && key <= totalLevel && key >= bestLevel) {
      bestLevel = key;
      bestTitle = levelUpRoles[key.toString()];
    }
  }
  if (bestTitle) {
    y += 28;
    ctx.font = 'bold 20px Montserrat, Arial';
    ctx.fillStyle = '#ff7bac';
    ctx.fillText(bestTitle, textStartX, y);
  } else {
    y += 12;
  }

  y += 18;
  ctx.font = '15px Montserrat, Arial';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Total Level: ${totalLevel}`, textStartX, y);
  y += 18;
  ctx.font = '15px Montserrat, Arial';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Total XP: ${(userData.xp || 0) + (userData.voice_xp || 0)}`, textStartX, y);
  y += 20;
  ctx.font = '16px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  let rankText = 'N/A';
  if (typeof serverRank === 'number' && serverRank > 0) {
    rankText = `#${serverRank}`;
  }
  ctx.fillText(`Server Rank: ${rankText}`, textStartX, y);

  // Progress bar section
  let sectionY = y + 36;
  const sectionGap = 64;
  const barW = cardW - cardPaddingX * 2 + 30;
  const barH = 18;
  const barX = textStartX;

  // Draw progress bar
  function drawRectBar(ctx, x, y, w, h, gradient, progress, text) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.closePath();
    ctx.fillStyle = '#23232b';
    ctx.fill();
    ctx.beginPath();
    ctx.rect(x, y, Math.min(w * progress, w), h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.font = 'bold 14px Montserrat, Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w/2, y + h/2);
    ctx.restore();
  }

  // Helper for sublevel and progress
  function getSubLevelAndProgress(xp) {
    let subLevel = 0;
    let prev = 0;
    let next = 0;
    if (xp < xpThresholds[levels[0]]) {
      // Level 0: show progress towards level 1
      prev = 0;
      next = xpThresholds[levels[0]];
      subLevel = 0;
    } else {
      for (let i = 0; i < levels.length; i++) {
        if (xp >= xpThresholds[levels[i]]) {
          subLevel = levels[i];
          prev = xpThresholds[levels[i]];
          next = xpThresholds[levels[i + 1]] || prev + 100;
        } else {
          break;
        }
      }
    }
    const inLevelXP = xp - prev;
    const neededXP = next - prev;
    return { subLevel, inLevelXP, neededXP, next };
  }

  // Message XP Section
  const msgXP = userData.xp || 0;
  const msgStats = getSubLevelAndProgress(msgXP);
  ctx.font = 'bold 15px Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Montserrat';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('💬 Message XP', barX, sectionY);

  ctx.font = '14px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  ctx.fillText(`Level: ${msgStats.subLevel}`, barX, sectionY + 18);
  ctx.font = '13px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  ctx.textAlign = 'right';
  ctx.fillText(`Total: ${msgXP} XP`, barX + barW, sectionY + 22);
  const msgBarY = sectionY + 32;
  const msgGradient = ctx.createLinearGradient(barX, msgBarY, barX + barW, msgBarY);
  msgGradient.addColorStop(0, '#ff7bac');
  msgGradient.addColorStop(1, '#a259e6');
  drawRectBar(ctx, barX, msgBarY, barW, barH, msgGradient, Math.max(0, Math.min(1, msgStats.neededXP ? msgStats.inLevelXP / msgStats.neededXP : 0)), `${msgStats.inLevelXP} / ${msgStats.neededXP} XP`);

  // Voice XP Section
  sectionY = msgBarY + barH + 32;
  const voiceXP = userData.voice_xp || 0;
  const voiceStats = getSubLevelAndProgress(voiceXP);
  ctx.font = 'bold 15px Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Montserrat';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('🎤 Voice XP', barX, sectionY);
  ctx.font = '14px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  ctx.fillText(`Level: ${voiceStats.subLevel}`, barX, sectionY + 18);
  ctx.font = '13px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#bdbdbd';
  ctx.textAlign = 'right';
  ctx.fillText(`Total: ${voiceXP} XP`, barX + barW, sectionY + 22);
  const voiceBarY = sectionY + 32;
  const voiceGradient = ctx.createLinearGradient(barX, voiceBarY, barX + barW, voiceBarY);
  voiceGradient.addColorStop(0, '#3ecbff');
  voiceGradient.addColorStop(1, '#3e6aff');
  drawRectBar(ctx, barX, voiceBarY, barW, barH, voiceGradient, Math.max(0, Math.min(1, voiceStats.neededXP ? voiceStats.inLevelXP / voiceStats.neededXP : 0)), `${voiceStats.inLevelXP} / ${voiceStats.neededXP} XP`);

  return canvas.toBuffer('image/png');
} 