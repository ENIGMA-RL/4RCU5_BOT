export const data = {
  name: 'ping',
  description: 'Shows latency in milliseconds'
};

export const execute = async (interaction) => {
  // lightweight rate limit via CooldownService if desired in config
  try {
    const { commandCooldownsConfig } = await import('../../config/configLoader.js');
    const cfg = commandCooldownsConfig();
    if (cfg?.commands?.ping?.enabled) {
      const { check: cdCheck, set: cdSet, formatRemaining: cdFormat } = await import('../../services/CooldownService.js');
      const res = cdCheck(interaction.member, 'ping');
      if (res.onCooldown) {
        const remaining = cdFormat(res.remainingTime);
        return interaction.reply({ content: `⏰ Try again in ${remaining}`, flags: 64 });
      }
      cdSet(interaction.member, 'ping');
    }
  } catch {}
  const sent = await interaction.reply({ content: 'Calculating latency...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`Latency: ${latency}ms`);
}; 