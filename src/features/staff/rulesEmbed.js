import { EmbedBuilder } from 'discord.js';
import { channelsConfig, rolesConfig } from '../../config/configLoader.js';

export async function updateRulesEmbed(client, guildId) {
  try {
    const channelId = channelsConfig().rulesChannelId;
    console.log(`[RulesEmbed] Attempting to update rules embed for guildId: ${guildId}, channelId: ${channelId}`);
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error('[RulesEmbed] Guild not found for rules embed update.');
      return;
    }
    console.log(`[RulesEmbed] Fetched guild: ${guild.name} (${guild.id})`);
    // Log all channel IDs in the guild
    const allChannels = await guild.channels.fetch();
    const channelIds = Array.from(allChannels.values()).map(c => `${c.name} (${c.id}) [type: ${c.type}]`);
    console.log(`[RulesEmbed] Guild channels:`, channelIds);
    // Fetch channel globally, then check ownership
    const channel = await client.channels.fetch(channelId).catch(e => {
      console.error(`[RulesEmbed] Error fetching channel: ${e}`);
      return null;
    });
    if (!channel) {
      console.error(`[RulesEmbed] Rules channel not found for ID: ${channelId}`);
      return;
    }
    console.log(`[RulesEmbed] Fetched channel: ${channel.name} (${channel.id}), type: ${channel.type}`);
    if (!channel.isTextBased()) {
      console.error('[RulesEmbed] Rules channel is not a text channel.');
      return;
    }
    if (channel.guildId !== guildId) {
      console.error(`[RulesEmbed] Channel's guildId (${channel.guildId}) does not match expected guildId (${guildId})`);
      return;
    }

    const asciiArt = `\n\n\
\`\`\`\n ______     __   __     ______   \n/\\  ___\\   /\\ "-.\\ \\   /\\  ___\\  \n\\ \\ \\____  \\ \\ \\- .  \\  \\ \\___  \\ \n \\ \\_____\\  \\ \\_\\"\\_\\  \\/_____\\\n  \\/_____/   \\/_/ \\/_/   \\/_____/
\`\`\`\n`;

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

If you need any help or assistance please tag <@&${rolesConfig().staffRole}>${asciiArt}`)
      .setFooter({ 
        text: '4RCU5', 
        iconURL: client.user.displayAvatarURL() 
      })
      .setTimestamp();

    // Find the most recent rules embed in the channel
    const messages = await channel.messages.fetch({ limit: 10 });
    const rulesMsg = messages.find(msg => msg.embeds[0]?.title === '🛡️ CNS Server Rules – Play Nice, Stay Sharp');
    if (rulesMsg) {
      await rulesMsg.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error in updateRulesEmbed:', error);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.path) {
      console.error('Error path:', error.path);
    }
  }
}