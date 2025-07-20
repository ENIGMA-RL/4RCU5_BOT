import fetch from 'node-fetch';

export const data = {
  name: 'funfact',
  description: 'Get a random useless fun fact!',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    await interaction.deferReply();

    // Fetch a random fact from the API
    const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch fact: ${response.status}`);
    }

    const factData = await response.json();

    // Send the fun fact as a plain text message
    const message = `${factData.text}`;

    await interaction.editReply(message);

  } catch (error) {
    console.error('Error in funfact command:', error);
    await interaction.editReply({
      content: '❌ Sorry, I couldn\'t fetch a fun fact right now. Please try again later!',
      flags: 64
    });
  }
}; 