import fetch from 'node-fetch';

export const data = {
  name: 'dadjoke',
  description: 'Get a random dad joke!',
  options: [],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    await interaction.deferReply();

    // Fetch a random dad joke from the API
    const response = await fetch('https://icanhazdadjoke.com/', {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dad joke: ${response.status}`);
    }

    const jokeData = await response.json();

    // Send the dad joke as a plain text message
    const message = `${jokeData.joke}`;

    await interaction.editReply(message);

  } catch (error) {
    console.error('Error in dadjoke command:', error);
    await interaction.editReply({
      content: '❌ Sorry, I couldn\'t fetch a dad joke right now. Please try again later!',
      flags: 64
    });
  }
}; 