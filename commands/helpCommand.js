/**
 * @module commands/helpCommand
 * @description Help command implementation for the WhatsApp bot
 * 
 * This module provides the !help command that displays information about
 * all available commands to the user. It retrieves the help text from
 * the command handler and sends it as a reply.
 */

/**
 * Handle help command requests by sending a list of all available commands
 * 
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} args - Command arguments (not used for help command)
 * @returns {Promise<void>}
 */
function handleHelpCommand(msg, args) {
  try {
    // "this" context is bound to commandHandler when registered
    const helpText = this.getHelpText();
    return msg.reply(helpText);
  } catch (error) {
    console.error('Error generating help text:', error);
    return msg.reply('Error generating help: ' + error.message);
  }
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Register this command with the command handler
   * 
   * @param {Object} commandHandler - Command handler instance
   */
  register: (commandHandler) => {
    // Bind the command handler to the help function so we can access its methods
    const boundHelpCommand = handleHelpCommand.bind(commandHandler);
    commandHandler.register('!help', boundHelpCommand, 'Show this help message with all available commands');
  }
};
