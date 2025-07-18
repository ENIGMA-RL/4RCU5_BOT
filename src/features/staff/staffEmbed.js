import { EmbedBuilder } from 'discord.js';
import staffConfig from '../../config/staff.json' with { type: 'json' };
import rolesConfig from '../../config/roles.json' with { type: 'json' };
import channelsConfig from '../../config/channels.json' with { type: 'json' };


export async function updateStaffEmbed(client, guildId, channelId) {
  let guild, channel;
  
  try {
    guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error('Guild not found for staff embed update.');
      return;
    }

    await guild.members.fetch();

    channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error('Staff channel not found or not a text channel.');
      return;
    }
  } catch (error) {
    console.error('Error fetching guild or channel for staff embed:', error);
    return;
  }

  try {
    const embed = new EmbedBuilder()
      .setTitle('👥 CNS Staff Team')
      .setDescription('Meet our dedicated staff members who keep CNS running smoothly!')
      .setColor('#b544ee')
      .setTimestamp();

    for (const roleConfig of staffConfig.staffRoles) {
      const role = await guild.roles.fetch(roleConfig.id);
      if (!role) {
        console.error(`Staff role ${roleConfig.id} not found.`);
        continue;
      }
      const members = role.members;
      let value;
      if (members.size === 0) {
        value = `<@&${role.id}>\n*No members currently*`;
      } else {
        value = `<@&${role.id}>\n` + members.map(member => `• ${member.toString()}`).join('\n');
      }
      embed.addFields({
        name: '',
        value,
        inline: false,
      });
    }

    // Add last updated footer
    embed.setFooter({ text: 'Last updated' });

    // Find the most recent staff embed in the channel
    const messages = await channel.messages.fetch({ limit: 10 });
    const staffMsg = messages.find(msg => msg.embeds[0]?.title === '👥 CNS Staff Team');
    if (staffMsg) {
      await staffMsg.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error updating staff embed:', error);
  }
}

export async function refreshStaffEmbed(client) {
  const guildId = rolesConfig.tagGuildId;
  const channelId = channelsConfig.staffChannelId;
  await updateStaffEmbed(client, guildId, channelId);
}

export function scheduleStaffEmbedUpdate(client, guildId, channelId) {
  console.log('📋 Scheduling staff embed updates every 5 minutes');
  setInterval(async () => {
    try {
      console.log('📋 Updating staff embed...');
      await updateStaffEmbed(client, guildId, channelId);
      console.log('✅ Staff embed updated successfully');
    } catch (error) {
      console.error('❌ Error in scheduled staff embed update:', error);
    }
  }, 5 * 60 * 1000);

  // Initial update
  console.log('📋 Running initial staff embed update...');
  updateStaffEmbed(client, guildId, channelId);
}
