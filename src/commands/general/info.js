export const data = {
  name: 'info',
  description: 'Provides information about the bot'
};

export const execute = async (interaction) => {
  await interaction.reply({
    content: `🤖 **CNS Bot 4RCU5**\nThis bot was custom-built for this CNS server by <@291218960471293953>.\n\nSource Code: https://github.com/ENIGMA-RL/4RCU5_BOT`,
    flags: 0
  });
}; 