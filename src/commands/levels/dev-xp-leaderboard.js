import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { getTopUsersByType } from '../../features/leveling/levelingSystem.js';
import { rolesConfig } from '../../config/configLoader.js';
import { check as cdCheck, set as cdSet, formatRemaining as cdFormat } from '../../services/CooldownService.js';
import logger from '../../utils/logger.js';

export const data = {
  name: 'dev-xp-leaderboard',
  description: 'Dev-only: View the top 50 members by total XP (paginated, private)',
  options: [
    {
      name: 'page',
      type: ApplicationCommandOptionType.Integer,
      description: 'Page number (1-5)',
      required: false,
      min_value: 1,
      max_value: 5
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  // Dev-only check
  const devRoleId = rolesConfig().cnsDeveloperRole;
  if (!interaction.member.roles.cache.has(devRoleId)) {
    await interaction.reply({
      content: '❌ Only users with the CNS Developer role can use this command.',
      flags: 64
    });
    return;
  }

  const page = interaction.options.getInteger('page') || 1;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  // Get top 50 users by total XP
  const users = await getTopUsersByType('total', 50);
  
  // Extract all user IDs for batch fetching
  const allUserIds = users.map(u => u.user_id);
  
  // Batch fetch all users from Discord API (much faster than individual calls)
  const res = cdCheck(interaction.member, 'dev-xp-leaderboard');
  if (res.onCooldown) {
    const remaining = cdFormat(res.remainingTime);
    await interaction.reply({ content: `⏰ Try again in ${remaining}`, flags: 64 });
    return;
  }
  const discordUsers = await Promise.all(
    allUserIds.map(id => 
      interaction.client.users.fetch(id).catch(() => null)
    )
  );
  cdSet(interaction.member, 'dev-xp-leaderboard');
  
  // Create a map for fast user lookup
  const userMap = new Map();
  discordUsers.forEach((user, index) => {
    if (user) {
      userMap.set(allUserIds[index], user);
    }
  });
  
  // Filter out deleted users and check server membership efficiently
  const userInfos = [];
  for (const u of users) {
    const userObj = userMap.get(u.user_id);
    if (!userObj) {
      logger.debug(`Skipping deleted user: ${u.user_id}`);
      continue;
    }
    
    // Check if user is still in the server using existing cache (no API call needed)
    const guildMember = interaction.guild.members.cache.get(u.user_id);
    const isInServer = guildMember !== null;
    
    // Only include users who are currently in the server
    if (isInServer) {
      userInfos.push({ ...u, username: userObj.username, isInServer: true });
      logger.debug(`User: ${userObj.username} (${u.user_id}) - In server: ${isInServer}`);
    } else {
      logger.debug(`Skipping user who left server: ${userObj.username} (${u.user_id})`);
    }
  }
  
  const pagedUsers = userInfos.slice(offset, offset + pageSize);

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Top 50 Members by Total XP')
    .setDescription(`Page ${page} of 5`)
    .setColor('#b544ee')
    .setTimestamp();

  let leaderboard = '';
  for (let i = 0; i < pagedUsers.length; i++) {
    const user = pagedUsers[i];
    leaderboard += `**#${offset + i + 1}**  ${user.username} — ${user.xp + user.voice_xp} XP\n`;
  }
  if (!leaderboard) leaderboard = 'No users found.';

  embed.addFields({
    name: 'Leaderboard',
    value: leaderboard
  });

  await interaction.reply({ embeds: [embed], flags: 64 });
}; 