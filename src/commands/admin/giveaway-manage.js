import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import GiveawayService from '../../features/giveaway/service.js';
import { giveawayConfig } from '../../config/configLoader.js';
import db from '../../database/connection.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway-manage')
  .setDescription('manage a giveaway via an ephemeral panel')
  .addStringOption(o => o.setName('giveaway_id').setDescription('optional id').setRequired(false));

export async function execute(interaction) {
  const cfg = giveawayConfig();
  const ok = cfg.admin_role_ids.some(r => interaction.member.roles.cache.has(r));
  if (!ok) return interaction.reply({ content: '❌ not allowed', ephemeral: true });

  let id = interaction.options.getString('giveaway_id');
  if (!id) {
    const svc = new GiveawayService();
    // Try active giveaway first, then fallback to latest in channel
    const active = svc.getActiveGiveaway(interaction.channelId);
    if (active) {
      id = active.id;
    } else {
      // Fallback to latest giveaway in channel (any status)
      const latest = db.prepare(`
        SELECT id FROM giveaways 
        WHERE channel_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(interaction.channelId);
      if (latest) {
        id = latest.id;
      }
    }
  }
  
  if (!id) return interaction.reply({ content: '❌ no target giveaway', ephemeral: true });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:mgr:open:${id}`).setLabel('Open').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gw:mgr:close:${id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`gw:mgr:delete:${id}`).setLabel('Delete').setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:mgr:draw:${id}`).setLabel('Draw').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gw:mgr:reroll:${id}`).setLabel('Reroll').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gw:mgr:publish:${id}`).setLabel('Publish').setStyle(ButtonStyle.Success)
  );

  const mini = new EmbedBuilder().setTitle('Giveaway Manager').setDescription(`Target: ${id}`);
  return interaction.reply({ flags: 64, embeds: [mini], components: [row1, row2] });
}
