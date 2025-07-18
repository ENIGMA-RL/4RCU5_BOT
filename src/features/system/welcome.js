import channelsConfig from '../../config/channels.json' with { type: 'json' };

export const sendWelcomeMessage = async (member) => {
  try {
    console.log(`📝 Attempting to send welcome message for ${member.user.username}`);
    const channel = await member.guild.channels.fetch(channelsConfig.welcomeChannelId);
    if (channel) {
      await channel.send(`<@${member.id}> Joined CNS`);
      console.log(`✅ Welcome message sent to ${channel.name}`);
    } else {
      console.log(`❌ Welcome channel ${channelsConfig.welcomeChannelId} not found`);
    }
  } catch (error) {
    console.error(`❌ Error in sendWelcomeMessage: ${error.message}`);
  }
}; 