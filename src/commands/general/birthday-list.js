import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getBirthdaysForGuild } from '../../repositories/birthdaysRepo.js';

export const data = new SlashCommandBuilder()
  .setName('birthdays')
  .setDescription('Show server birthdays (day and month only).');

function pad(n) {
  return String(n).padStart(2, '0');
}

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const guildName = interaction.guild?.name || 'Server';
  const list = getBirthdaysForGuild ? getBirthdaysForGuild(guildId) : [];

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  const byMonth = new Map();
  for (const b of list) {
    const key = b.birth_month;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(b);
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎂 Birthday List - ${guildName}`)
    .setColor('#b544ee');

  // registration hint
  embed.setDescription('➤ Register your Birthday with\n`/set-birthday <day> <month> [year]`');

  let any = false;
  for (let m = 1; m <= 12; m++) {
    const arr = (byMonth.get(m) || []).sort((a,b) => a.birth_day - b.birth_day);
    if (!arr.length) continue;
    any = true;
    const value = arr.map(b => `<@${b.user_id}> ${pad(b.birth_day)} ${months[m-1]}`).join('\n');
    embed.addFields({ name: months[m-1], value, inline: false });
  }

  if (!any) embed.addFields({ name: 'No birthdays', value: 'No birthdays set yet.', inline: false });

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
