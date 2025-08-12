export const name = 'interactionCreate';
export const execute = async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
      }
    }
    return;
  }

  // Handle message context menu commands
  if (interaction.isMessageContextMenuCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No context menu command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
      }
    }
    return;
  }

  // Handle modal submissions for reply as bot
  if (interaction.isModalSubmit() && interaction.customId.startsWith('replyAsBot|')) {
    const [, targetId] = interaction.customId.split('|');
    const text = interaction.fields.getTextInputValue('replyText');

    try {
      const targetMsg = await interaction.channel.messages.fetch(targetId);
      await targetMsg.reply({ content: text });
      await interaction.reply({ content: '✅ message sent as reply', flags: 64 });
    } catch (e) {
      console.error('Error in reply as bot modal:', e);
      await interaction.reply({ content: '❌ could not fetch target message', flags: 64 });
    }
    return;
  }

  // Handle modal submissions for say command
  if (interaction.isModalSubmit() && interaction.customId.startsWith('sayModal|')) {
    const [, messageId] = interaction.customId.split('|');
    const text = interaction.fields.getTextInputValue('messageText');

    try {
      // Process newlines in the text
      const processedText = text.replace(/\\n/g, '\n');

      if (messageId) {
        // Reply to the target message
        const targetMsg = await interaction.channel.messages.fetch(messageId);
        await targetMsg.reply({ content: processedText });
        await interaction.reply({ content: '✅ message sent as reply', flags: 64 });
      } else {
        // Send to the channel
        await interaction.channel.send({ content: processedText });
        await interaction.reply({ content: '✅ message sent', flags: 64 });
      }
    } catch (e) {
      console.error('Error in say modal:', e);
      if (messageId) {
        await interaction.reply({ content: '❌ could not fetch target message', flags: 64 });
      } else {
        await interaction.reply({ content: '❌ error sending message', flags: 64 });
      }
    }
    return;
  }
}; 