/**
 * Template Command for WhatsApp Bot
 * Use this as a starting point for creating new commands
 */

/**
 * Handle template command requests
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments
 */
async function handleTemplateCommand(msg, args) {
  // You can access the sender's information
  const contact = await msg.getContact();
  const sender = contact.pushname || contact.number;
  
  // Simple response example
  msg.reply(`Hello ${sender}, you said: ${args}`);
  
  // You can also send more complex responses:
  // msg.reply(`
  //   *Bold Text*
  //   _Italic Text_
  //   ```
  //   Code Block
  //   ```
  // `);
  
  // If you need to process complex data or make API calls,
  // be sure to handle errors properly:
  // try {
  //   const response = await fetch('https://api.example.com/data');
  //   const data = await response.json();
  //   msg.reply(`Result: ${data.result}`);
  // } catch (error) {
  //   console.error('API error:', error);
  //   msg.reply('Sorry, there was a problem processing your request.');
  // }
}

// This is commented out because this is just a template
// Uncomment and modify to create an actual command
/*
module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!template', handleTemplateCommand, 'Template command description');
  }
};
*/

// To use this template:
// 1. Copy this file with a new name (e.g., myCommand.js)
// 2. Modify the function to implement your command logic
// 3. Uncomment and update the module.exports block
// 4. Restart the bot
