/**
 * @module commands/templateCommand
 * @description Template command for WhatsApp Bot
 * 
 * This module serves as a starting point for creating new commands.
 * It demonstrates proper structure, error handling, and documentation
 * standards for WhatsApp bot commands.
 * 
 * To use this template:
 * 1. Copy this file with a new name (e.g., myCommand.js)
 * 2. Modify the function to implement your command logic
 * 3. Uncomment and update the module.exports block
 * 4. Add the command to commands/index.js (automatic if following standards)
 */

/**
 * Handle template command requests
 * 
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {Function} msg.getContact - Function to get contact information
 * @param {string} args - Command arguments (text following the command)
 * @returns {Promise<void>} A promise that resolves when the command is complete
 * @throws {Error} If there's an issue with the command processing
 */
async function handleTemplateCommand(msg, args) {
  try {
    // Get sender information to personalize the response
    const contact = await msg.getContact();
    const sender = contact.pushname || contact.number || 'User';
  
    // Simple response example
    await msg.reply(`Hello ${sender}, you said: ${args}`);
  
    /*
    // Example of complex formatted response
    await msg.reply(`
      *Bold Text*
      _Italic Text_
      \`\`\`
      Code Block
      \`\`\`
    `);
    */

    /*
    // Example of API call with proper error handling
    const { safeApiRequest } = require('./utils');
    const response = await safeApiRequest('https://api.example.com/data');
    
    if (response.success) {
      await msg.reply(`Result: ${response.data.result}`);
    } else {
      await msg.reply('API returned an error: ' + response.error);
    }
    */
  } catch (error) {
    console.error('Template command error:', error);
    await msg.reply('Sorry, there was a problem processing your request.');
  }
}

/**
 * Template command module exports
 * 
 * @type {Object}
 */
module.exports = {
  // Register this command with the command handler
  // @param {Object} commandHandler - Command handler instance
  register: (commandHandler) => {
    // Template is disabled by default - uncomment the line below to enable it
    // commandHandler.register('!template', handleTemplateCommand, 'Template command description');
    
    // This empty function prevents errors when this file is loaded by the command system
  }
};
