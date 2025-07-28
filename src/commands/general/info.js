import { botConfig } from '../../config/configLoader.js';

export const data = {
  name: 'info',
  description: 'Provides information about the bot'
};

export const execute = async (interaction) => {
  const ownerID = botConfig().ownerID;
  await interaction.reply({
    content: `🤖 **CNS Bot 4RCU5**\nThis bot was custom-built for this CNS server by <@${ownerID}>.\n\nSource Code: https://github.com/ENIGMA-RL/4RCU5_BOT`,
    flags: 0
  });
}; 