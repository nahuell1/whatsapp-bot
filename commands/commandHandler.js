/**
 * Command Handler for WhatsApp Bot
 * Manages registration and execution of bot commands
 */

class CommandHandler {
  /**
   * Creates a new CommandHandler instance
   */
  constructor() {
    /**
     * Map of command prefixes to their handler functions
     * @type {Map<string, function>}
     */
    this.commands = new Map();
    
    /**
     * Array of help messages for each command
     * @type {Array<string>}
     */
    this.helpMessages = [];
  }

  /**
   * Register a new command
   * @param {string} prefix - Command prefix that triggers this command
   * @param {function} handler - Async function that handles the command
   * @param {string} helpText - Help text for this command
   */
  register(prefix, handler, helpText) {
    if (this.commands.has(prefix)) {
      console.warn(`Command with prefix '${prefix}' is already registered. Overwriting...`);
    }
    
    this.commands.set(prefix, handler);
    this.helpMessages.push(`${prefix}: ${helpText}`);
    
    console.log(`Registered command with prefix: ${prefix}`);
  }

  /**
   * Process an incoming message
   * @param {object} msg - WhatsApp message object
   * @returns {boolean} - Whether a command was handled
   */
  async handleMessage(msg) {
    const text = msg.body.trim();
    
    // Check if this message matches any registered command
    for (const [prefix, handler] of this.commands.entries()) {
      if (text.startsWith(prefix)) {
        const args = text.slice(prefix.length).trim();
        try {
          await handler(msg, args);
        } catch (error) {
          console.error(`Error executing command ${prefix}:`, error);
          msg.reply(`Error executing command: ${error.message}`);
        }
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get help messages for all registered commands
   * @returns {string} - Formatted help text
   */
  getHelpText() {
    if (this.helpMessages.length === 0) {
      return "No commands are registered.";
    }
    
    return "Available commands:\n" + this.helpMessages.join("\n");
  }
}

module.exports = new CommandHandler();
