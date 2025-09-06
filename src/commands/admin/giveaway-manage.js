import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import GiveawayService from '../../features/giveaway/service.js';
import { giveawayConfig } from '../../config/configLoader.js';
import db from '../../database/connection.js';
import { countActiveEntries } from '../../repositories/giveawaysRepo.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway-manage')
  .setDescription('Manage a giveaway via an ephemeral panel')
  .addStringOption(o =>
    o.setName('giveaway_id')
     .setDescription('Optional explicit giveaway id')
     .setRequired(false)
  );

export async function execute(interaction) {
  const cfg = giveawayConfig();
  const isAdmin = cfg.admin_role_ids?.some(r => interaction.member.roles.cache.has(r));
  if (!isAdmin) {
    return interaction.reply({ content: '❌ not allowed', ephemeral: true });
  }

  // 1) Bepaal target giveaway-id
  let id = interaction.options.getString('giveaway_id');
  if (!id) {
    const svc = new GiveawayService();
    const active = svc.getActiveGiveaway(interaction.channelId);
    if (active) {
      id = active.id;
    } else {
      const latest = db.prepare(`
        SELECT id FROM giveaways
        WHERE channel_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(interaction.channelId);
      if (latest) id = latest.id;
    }
  }

  if (!id) {
    return interaction.reply({ content: '❌ no target giveaway found for this channel', ephemeral: true });
  }

  // 2) Haal actuele staat op (voor status/ends/entries)
  const gv = db.prepare(`SELECT * FROM giveaways WHERE id = ?`).get(id);
  if (!gv) {
    return interaction.reply({ content: `❌ giveaway not found: ${id}`, ephemeral: true });
  }

  const entries = countActiveEntries(id);
  const endMs = gv.end_at < 1e12 ? gv.end_at * 1000 : gv.end_at;
  const endSec = Math.floor(endMs / 1000);
  const status = gv.status;

  const embed = new EmbedBuilder()
    .setTitle('Giveaway Manager')
    .setDescription([
      `**ID:** \`${id}\``,
      `**Status:** \`${status}\``,
      `**Ends:** <t:${endSec}:f>`,
      `**Entries:** ${entries}`
    ].join('\n'));

  // 3) Knoppen (context-gevoelig)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gw:mgr:open:${id}`)
      .setLabel('Open')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!(status === 'closed')),
    new ButtonBuilder()
      .setCustomId(`gw:mgr:close:${id}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!(status === 'open')),
    new ButtonBuilder()
      .setCustomId(`gw:mgr:delete:${id}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gw:mgr:draw:${id}`)
      .setLabel('Draw')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!(status === 'closed')),
    new ButtonBuilder()
      .setCustomId(`gw:mgr:reroll:${id}`)
      .setLabel('Reroll')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!(status === 'drawn_unpublished')),
    new ButtonBuilder()
      .setCustomId(`gw:mgr:publish:${id}`)
      .setLabel('Publish')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!(status === 'drawn_unpublished'))
  );

  return interaction.reply({
    ephemeral: true,
    embeds: [embed],
    components: [row1, row2]
  });
}
