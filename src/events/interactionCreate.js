export const name = 'interactionCreate';
import { handleInteractionError } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';

export const execute = async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    log.error(`No command matching ${interaction.commandName} was found`, null, {
      commandName: interaction.commandName,
      userId: interaction.user?.id,
      guildId: interaction.guild?.id
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    await handleInteractionError(interaction, error, { 
      commandName: interaction.commandName 
    });
  }
}; 