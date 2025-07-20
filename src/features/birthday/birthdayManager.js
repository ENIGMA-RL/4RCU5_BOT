import db from '../../database/db.js';
import { channelsConfig, rolesConfig } from '../../config/configLoader.js';
import { logRoleChange } from '../../utils/botLogger.js';

// Random birthday icons for the "Happy Birthday" part
const birthdayIcons = [
  "🎉", "🎂", "🎊", "🎈", "🎁", "🌟"
];

// Birthday messages without icons
const birthdayMessages = [
  "Hope you have an amazing day!",
  "Wishing you all the best!",
  "Have a fantastic celebration!",
  "May your day be filled with joy!",
  "Enjoy your special day!",
  "Shine bright today and always!",
  "Let the celebrations begin!",
  "Another year of amazing adventures awaits!",
  "Create beautiful memories today!",
  "Let the music of joy fill your day!",
  "Light up the world with your smile!",
  "You deserve all the happiness today!"
];

/**
 * Get a random birthday icon and message
 */
function getRandomBirthdayContent() {
  const randomIcon = birthdayIcons[Math.floor(Math.random() * birthdayIcons.length)];
  const randomMessage = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
  return { icon: randomIcon, message: randomMessage };
}

/**
 * Check for birthdays and handle role assignments
 */
export async function checkBirthdays(client) {
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentHour = today.getHours();

    // Get all birthdays for today
    const stmt = db.prepare(`
      SELECT user_id, guild_id, birth_day, birth_month, birth_year
      FROM birthdays 
      WHERE birth_day = ? AND birth_month = ?
    `);
    
    const birthdays = stmt.all(currentDay, currentMonth);

    for (const birthday of birthdays) {
      const guild = client.guilds.cache.get(birthday.guild_id);
      if (!guild) continue;

      const member = await guild.members.fetch(birthday.user_id).catch(() => null);
      if (!member) continue;

      const birthdayRoleId = rolesConfig().birthdayRole;
      const birthdayRole = guild.roles.cache.get(birthdayRoleId);
      if (!birthdayRole) continue;

      // Check if it's 7 AM for birthday message
      if (currentHour === 7) {
        await sendBirthdayMessage(client, guild, member);
      }

      // Check if it's midnight (0 AM) for role assignment
      if (currentHour === 0) {
        await assignBirthdayRole(member, birthdayRole);
      }

      // Check if it's 11:59 PM to remove the role (24 hours after assignment)
      if (currentHour === 23) {
        await removeBirthdayRole(member, birthdayRole);
      }
    }
  } catch (error) {
    console.error('Error checking birthdays:', error);
  }
}

/**
 * Send birthday message to general chat
 */
async function sendBirthdayMessage(client, guild, member) {
  try {
    const generalChannelId = channelsConfig().generalChannelId;
    const generalChannel = await guild.channels.fetch(generalChannelId).catch(() => null);
    
    if (generalChannel && generalChannel.isTextBased()) {
      const { icon, message } = getRandomBirthdayContent();
      await generalChannel.send(`${icon} **Happy Birthday <@${member.id}>!** ${message}`);
    }
  } catch (error) {
    console.error('Error sending birthday message:', error);
  }
}

/**
 * Assign birthday role to member
 */
async function assignBirthdayRole(member, birthdayRole) {
  try {
    if (!member.roles.cache.has(birthdayRole.id)) {
      await member.roles.add(birthdayRole.id, 'Birthday role assignment');
      await logRoleChange(member.client, member.id, member.user.tag, 'Assigned', birthdayRole.name, 'Birthday celebration');
    }
  } catch (error) {
    console.error('Error assigning birthday role:', error);
  }
}

/**
 * Remove birthday role from member
 */
async function removeBirthdayRole(member, birthdayRole) {
  try {
    if (member.roles.cache.has(birthdayRole.id)) {
      await member.roles.remove(birthdayRole.id, 'Birthday role expiration');
      await logRoleChange(member.client, member.id, member.user.tag, 'Removed', birthdayRole.name, 'Birthday celebration ended');
    }
  } catch (error) {
    console.error('Error removing birthday role:', error);
  }
}

/**
 * Get user's birthday info (without year for privacy)
 */
export function getUserBirthday(userId, guildId) {
  const stmt = db.prepare(`
    SELECT birth_day, birth_month, created_at
    FROM birthdays 
    WHERE user_id = ? AND guild_id = ?
  `);
  return stmt.get(userId, guildId);
}

/**
 * Remove user's birthday
 */
export function removeUserBirthday(userId, guildId) {
  const stmt = db.prepare(`
    DELETE FROM birthdays 
    WHERE user_id = ? AND guild_id = ?
  `);
  return stmt.run(userId, guildId);
} 