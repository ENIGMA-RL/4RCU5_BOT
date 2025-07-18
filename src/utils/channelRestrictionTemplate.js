import { channelsConfig } from '../config/configLoader.js';
import { shouldBypassChannelRestrictions } from './channelUtils.js';

// Example command structure:
export const execute = async (interaction) => {
  try {
    // Channel restriction (bypassed in bot test channel)
    if (!shouldBypassChannelRestrictions(interaction.channelId) && 
        interaction.channelId !== channelsConfig().requiredChannelId) {
      await interaction.reply({
        content: `❌ This command can only be used in <#${channelsConfig().requiredChannelId}>`,
        flags: 64
      });
      return;
    }

    // Command logic here...
    await interaction.reply('Command executed successfully!');
    
  } catch (error) {
    console.error('Error in command:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while executing this command.',
      flags: 64 
    });
  }
};
