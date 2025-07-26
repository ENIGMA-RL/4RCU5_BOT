import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import db from '../../database/db.js';
import { channelsConfig, rolesConfig } from '../../config/configLoader.js';

// Helper function to get month name
function getMonthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1];
}

export const data = {
  name: 'birthday',
  description: 'Set your birthday to receive birthday wishes and a special role!',
  options: [
    {
      name: 'day',
      description: 'Your birth day (1-31)',
      type: 4, // INTEGER
      required: true,
      min_value: 1,
      max_value: 31
    },
    {
      name: 'month',
      description: 'Your birth month (1-12)',
      type: 4, // INTEGER
      required: true,
      min_value: 1,
      max_value: 12
    },
    {
      name: 'year',
      description: 'Your birth year (1900-2020)',
      type: 4, // INTEGER
      required: true,
      min_value: 1900,
      max_value: 2020
    }
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');
    const year = interaction.options.getInteger('year');

    // Validate the date
    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getDate() !== day || birthDate.getMonth() !== month - 1 || birthDate.getFullYear() !== year) {
      await interaction.reply({
        content: '❌ Invalid date! Please enter a valid birth date.',
        flags: 64
      });
      return;
    }

    // Check if date is in the future
    const today = new Date();
    if (birthDate > today) {
      await interaction.reply({
        content: '❌ Birth date cannot be in the future!',
        flags: 64
      });
      return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const username = interaction.user.tag;

    // Store or update the birthday in the database
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO birthdays (user_id, guild_id, username, birth_day, birth_month, birth_year, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(userId, guildId, username, day, month, year, Date.now());

    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('🎉 Birthday Set Successfully!')
      .setDescription(`Your birthday has been set to **${getMonthName(month)} ${day}**!`)
      .addFields(
        { name: '🎁 What happens on your birthday?', value: '• You\'ll receive a birthday message in general chat\n• You\'ll get a special birthday role during your birthday\n• Your age will always remain private', inline: false }
      )
      .setColor('#FF69B4')
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: 64
    });

  } catch (error) {
    console.error('Error in birthday command:', error);
    await interaction.reply({
      content: '❌ An error occurred while setting your birthday. Please try again.',
      flags: 64
    });
  }
}; 