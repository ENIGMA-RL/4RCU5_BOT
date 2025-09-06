import { SlashCommandBuilder } from 'discord.js';
import GiveawayService from '../../features/giveaway/service.js';
import { giveawayConfig } from '../../config/configLoader.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('create a giveaway')
  .addStringOption(o => o.setName('description').setDescription('what is the prize or context').setRequired(true).setMaxLength(1000))
  .addStringOption(o => o.setName('duration').setDescription('10m | 2h | 1d').setRequired(true).setMaxLength(10))
  .addAttachmentOption(o => o.setName('image').setDescription('optional image').setRequired(false));

export const cooldown = 10;

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  const cfg = giveawayConfig();
  const ok = cfg.admin_role_ids.some(r => interaction.member.roles.cache.has(r));
  if (!ok) return interaction.editReply('❌ not allowed');

  const description = interaction.options.getString('description', true);
  const duration = interaction.options.getString('duration', true);
  const image = interaction.options.getAttachment('image') || null;

  const svc = new GiveawayService();
  const { giveawayId, message } = await svc.createGiveaway({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    description,
    imageAttachment: image,
    duration,
    createdBy: interaction.user.id,
    client: interaction.client
  });

  return interaction.editReply(`✅ created • id: ${giveawayId}\n${message.url}`);
}
