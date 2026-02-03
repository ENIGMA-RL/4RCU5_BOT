import fetch from 'node-fetch';
import logger from '../../utils/logger.js';

export const data = {
  name: 'funfact',
  description: 'Get a random useless fun fact!',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    await interaction.deferReply();

    const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');

    if (!response.ok) {
      logger.warn({ status: response.status }, 'funfact API returned non-OK');
      await interaction.editReply({
        content: '❌ Sorry, I couldn\'t fetch a fun fact right now. Please try again later!',
        flags: 64
      });
      return;
    }

    const factData = await response.json();
    await interaction.editReply(`${factData.text}`);
  } catch (error) {
    logger.warn({ err: error }, 'Error in funfact command');
    try {
      await interaction.editReply({
        content: '❌ Sorry, I couldn\'t fetch a fun fact right now. Please try again later!',
        flags: 64
      });
    } catch (e) {
      logger.warn({ err: e }, 'funfact: could not editReply');
    }
  }
}; 