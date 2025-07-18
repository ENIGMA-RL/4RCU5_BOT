import { ApplicationCommandOptionType, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import rolesConfig from '../../config/roles.json' with { type: 'json' };

export const data = {
  name: 'setbackground',
  description: 'Upload a background image for rank cards',
  options: [
    {
      name: 'image',
      type: ApplicationCommandOptionType.Attachment,
      description: 'The background image to use (PNG, JPG, JPEG)',
      required: true,
    },
  ],
  defaultMemberPermissions: null
};

export const execute = async (interaction) => {
  try {
    // Restrict to CNS Developer role only
    const devRoleId = rolesConfig.cnsDeveloperRole;
    if (!interaction.member.roles.cache.has(devRoleId)) {
      await interaction.reply({
        content: '❌ Only users with the CNS Developer role can set the rank card background.',
        flags: 64
      });
      return;
    }

    const attachment = interaction.options.getAttachment('image');
    
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(attachment.contentType)) {
      await interaction.reply({
        content: '❌ Please upload a PNG, JPG, or JPEG image.',
        flags: 64
      });
      return;
    }

    // Validate file size (max 10MB)
    if (attachment.size > 10 * 1024 * 1024) {
      await interaction.reply({
        content: '❌ Image file size must be less than 10MB.',
        flags: 64
      });
      return;
    }

    // Create backgrounds directory if it doesn't exist
    const backgroundsDir = path.join(process.cwd(), 'src', 'assets', 'backgrounds');
    if (!fs.existsSync(backgroundsDir)) {
      fs.mkdirSync(backgroundsDir, { recursive: true });
    }

    // Download the image
    const response = await fetch(attachment.url);
    const buffer = await response.arrayBuffer();
    
    // Save the image
    const backgroundPath = path.join(backgroundsDir, 'rank-background.png');
    fs.writeFileSync(backgroundPath, Buffer.from(buffer));

    await interaction.reply({
      content: '✅ Background image uploaded successfully! Rank cards will now use this background.',
      flags: 64
    });

  } catch (error) {
    console.error('Error in setbackground command:', error);
    await interaction.reply({
      content: '❌ An error occurred while uploading the background image.',
      flags: 64
    });
  }
}; 