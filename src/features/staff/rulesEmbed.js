import { EmbedBuilder } from 'discord.js';
import channelsConfig from '../../config/channels.json' with { type: 'json' };
import rolesConfig from '../../config/roles.json' with { type: 'json' };

export async function updateRulesEmbed(client, guildId) {
  const channelId = channelsConfig.rulesChannelId;
  const staffRoleId = rolesConfig.staffRole;
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    console.error('Guild not found for rules embed update.');
    return;
  }
  const channel = await guild.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    console.error('Rules channel not found or not a text channel.');
    return;
  }

  const asciiArt = `\n\n\`\`\`\n ______     __   __     ______   \n/\\  ___\\   /\\ "-.\\ \\   /\\  ___\\  \n\\ \\ \\____  \\ \\ \\- .  \\  \\ \\___  \\ \n \\ \\_____\\  \\ \\_\\\"\\_\\  \\/_____\\\n  \\/_____/   \\/_/ \\/_/   \\/_____/\n\`\`\`\n`;

  const embed = new EmbedBuilder()
    .setTitle('🛡️ CNS Server Rules – Play Nice, Stay Sharp')
    .setColor('#b544ee')
    .setDescription(`
1. **Respect is Mandatory**
Treat everyone with basic decency. No racism, hate speech, or personal attacks.

2. **Keep it Clean**
No NSFW content, shock stuff, or overly edgy nonsense. You’re not edgy – you're just getting banned.

3. **No Spam, No Scams**
Don’t flood chat, mic spam, or post sketchy links.

4. **English Only**
We roll with English here to keep comms clear for all contestants.

5. **No Ads or Self-Promo**
We’re here for CNS and The Finals, not your mixtape or crypto coin.

6. **VAIIYA Members Not Allowed**
You know who you are. This ain't your playground.

If you need any help or assistance please tag <@&${staffRoleId}>${asciiArt}`)
    .setFooter({ text: 'Last updated' })
    .setTimestamp();

  // Find the most recent rules embed in the channel
  const messages = await channel.messages.fetch({ limit: 10 });
  const rulesMsg = messages.find(msg => msg.embeds[0]?.title === '🛡️ CNS Server Rules – Play Nice, Stay Sharp');
  if (rulesMsg) {
    await rulesMsg.edit({ embeds: [embed] });
    // Optionally keep this log if you want to track rules updates
    // console.log(`Rules embed updated in #${channel.name} (edited)`);
  } else {
    await channel.send({ embeds: [embed] });
    // Optionally keep this log if you want to track rules posts
    // console.log(`Rules embed posted in #${channel.name}`);
  }
} 