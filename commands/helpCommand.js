/**
 * Help Command for WhatsApp Bot
 * Shows available commands and usage information
 */

/**
 * Handle help command requests
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments (not used)
 * @param {object} commandHandler - Command handler instance
 */
function handleHelpCommand(msg, args) {
  // commandHandler is available through closure when registered
  msg.reply(this.getHelpText());
}

module.exports = {
  register: (commandHandler) => {
    // Bind the command handler to the help function so we can access its methods
    const boundHelpCommand = handleHelpCommand.bind(commandHandler);
    commandHandler.register('!help', boundHelpCommand, 'Show this help message');
  }
};
