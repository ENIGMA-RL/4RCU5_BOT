import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { getTopUsersByType } from '../../features/leveling/levelingSystem.js';
import { rolesConfig } from '../../config/configLoader.js';

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
      ephemeral: true
    });
    return;
  }

  const page = interaction.options.getInteger('page') || 1;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  // Get top 50 users by total XP
  const users = await getTopUsersByType('total', 50);
  const pagedUsers = users.slice(offset, offset + pageSize);

  // Fetch Discord usernames
  const userInfos = await Promise.all(pagedUsers.map(async (u) => {
    try {
      const userObj = await interaction.client.users.fetch(u.user_id);
      return { ...u, username: userObj.username };
    } catch {
      return { ...u, username: u.user_id };
    }
  }));

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Top 50 Members by Total XP')
    .setDescription(`Page ${page} of 5`)
    .setColor('#b544ee')
    .setTimestamp();

  let leaderboard = '';
  for (let i = 0; i < userInfos.length; i++) {
    const user = userInfos[i];
    leaderboard += `**#${offset + i + 1}**  ${user.username} — ${user.xp + user.voice_xp} XP\n`;
  }
  if (!leaderboard) leaderboard = 'No users found.';

  embed.addFields({
    name: 'Leaderboard',
    value: leaderboard
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}; 