import { updateUserXP, getUser, createUser } from '../../repositories/usersRepo.js';
import { levelSettingsConfig, rolesConfig } from '../../config/configLoader.js';

export const data = {
  name: 'migrate-message-xp',
  description: 'DEV ONLY: Count all messages per user and update message XP accordingly',
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  const memberRoles = interaction.member.roles.cache;
  const isCnsDev = memberRoles.has(rolesConfig().cnsDeveloperRole);
  if (!isCnsDev) {
    await interaction.reply({
      content: '❌ Only users with the CNS Developer role can use this command.',
      flags: 64
    });
    return;
  }

  // Try to defer, and abort if it fails
  try {
    await interaction.deferReply({ flags: 64 });
  } catch (err) {
    console.error('Failed to defer interaction:', err);
    return;
  }

  try {
    await interaction.editReply({
      content: '⏳ Counting messages in all text channels. This may take up to a minute...'
    });
    const guild = interaction.guild;
    const xpPerMessage = levelSettingsConfig().leveling.xpPerMessage;
    const userMessageCounts = {};
    let totalMessages = 0;
    let channelCount = 0;
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased() || channel.type !== 0) continue; // Only text channels
      channelCount++;
      let lastId = undefined;
      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        for (const msg of fetched.values()) {
          if (msg.author.bot) continue;
          userMessageCounts[msg.author.id] = (userMessageCounts[msg.author.id] || 0) + 1;
          totalMessages++;
        }
        lastId = fetched.last()?.id;
      } while (fetched && fetched.size === 100);
    }
    // Update XP for each user (overwrite message XP with recalculated value)
    let updatedUsers = 0;
    for (const [userId, count] of Object.entries(userMessageCounts)) {
      let user = getUser(userId);
      if (!user) {
        createUser(userId);
        user = getUser(userId);
      }
      const newMessageXP = count * xpPerMessage;
      // Reset existing message XP to 0, then set to the new calculated value
      updateUserXP(userId, -(user?.xp || 0), 0);
      updateUserXP(userId, newMessageXP, 0);
      updatedUsers++;
    }
    await interaction.editReply({
      content: `✅ Migration complete! Processed ${totalMessages} messages across ${channelCount} channels. Updated XP for ${updatedUsers} users.`,
      flags: 64
    });
  } catch (error) {
    try {
      await interaction.editReply({
        content: '❌ An error occurred during migration.',
        flags: 64
      });
    } catch (editErr) {
      console.error('Failed to edit reply after error:', editErr);
    }
    console.error('Migration error:', error);
  }
}; 