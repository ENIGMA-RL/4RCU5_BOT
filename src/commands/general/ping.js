export const data = {
  name: 'ping',
  description: 'Shows latency in milliseconds'
};

export const execute = async (interaction) => {
  const sent = await interaction.reply({ content: 'Calculating latency...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`Latency: ${latency}ms`);
}; 