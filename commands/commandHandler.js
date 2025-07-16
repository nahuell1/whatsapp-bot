/**
 * @module commands/commandHandler
 * @description Core command handler for the WhatsApp bot
 * 
 * This module provides a central registry and processing system for all bot commands.
 * It manages command registration, message handling, and help text generation.
 * Each command is registered with a prefix, handler function, and help text.
 */

/**
 * Command handler class for managing bot commands
 * @class
 */
class CommandHandler {
  /**
   * Creates a new CommandHandler instance
   * @constructor
   */
  constructor() {
    /**
     * Map of command prefixes to their handler functions
     * @type {Map<string, Function>}
     * @private
     */
    this.commands = new Map();
    
    /**
     * Array of help messages for each command
     * @type {Array<string>}
     * @private
     */
    this.helpMessages = [];
  }

  /**
   * Register a new command with the handler
   * 
   * @param {string} prefix - Command prefix that triggers this command (e.g., "!help")
   * @param {Function} handler - Async function that handles the command execution
   * @param {string} helpText - Help text description for this command
   * @throws {Error} If handler is not a function
   */
  register(prefix, handler, helpText) {
    // Validate inputs
    if (typeof prefix !== 'string' || !prefix) {
      throw new Error('Command prefix must be a non-empty string');
    }
    
    if (typeof handler !== 'function') {
      throw new Error(`Handler for command '${prefix}' must be a function`);
    }
    
    // Warn if overwriting an existing command
    if (this.commands.has(prefix)) {
      console.warn(`Command with prefix '${prefix}' is already registered. Overwriting...`);
    }
    
    // Register the command and help text
    this.commands.set(prefix, handler);
    this.helpMessages.push(`${prefix}: ${helpText || 'No description provided'}`);
    
    console.log(`Registered command with prefix: ${prefix}`);
  }

  /**
   * Process an incoming message and execute matching commands
   * 
   * @async
   * @param {Object} msg - WhatsApp message object
   * @param {string} msg.body - The text content of the message
   * @param {Function} msg.reply - Function to reply to the message
   * @returns {boolean} - Whether a command was handled
   * @throws {Error} If message processing fails catastrophically
   */
  async handleMessage(msg) {
    if (!msg || !msg.body) {
      console.warn('Received invalid message object');
      return false;
    }
    
    const text = msg.body.trim();
    
    // Check if this message matches any registered command
    for (const [prefix, handler] of this.commands.entries()) {
      if (text.startsWith(prefix)) {
        // Extract arguments by removing the prefix
        const args = text.slice(prefix.length).trim();
        
        // Log command execution
        console.log(`Executing command: ${prefix} with args: ${args}`);
        
        try {
          // Execute the command handler
          await handler(msg, args);
          return true;
        } catch (error) {
          // Handle command execution errors gracefully
          console.error(`Error executing command ${prefix}:`, error);
          try {
            // Use a safer reply method that doesn't rely on chat.sendMessage
            const errorMsg = `❌ Error: ${error.message}`;
            await msg.reply(errorMsg);
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
            // Try alternative method if reply fails
            try {
              const chat = await msg.getChat();
              await chat.sendMessage(`❌ Command failed: ${error.message}`);
            } catch (altError) {
              console.error('All reply methods failed:', altError);
            }
          }
          return true; // Still count as handled even if it failed
        }
      }
    }
    
    // No matching command found
    return false;
  }

  /**
   * Get help messages for all registered commands
   * 
   * @returns {string} - Formatted help text with all available commands
   */
  getHelpText() {
    if (this.helpMessages.length === 0) {
      return "No hay comandos registrados.";
    }
    
    // Sort help messages alphabetically for easier reading
    const sortedMessages = [...this.helpMessages].sort();
    
    // Format each command nicely
    const formattedMessages = sortedMessages.map(msg => {
      const [command, ...descParts] = msg.split(': ');
      const description = descParts.join(': ');
      return `*${command}*\n${description}\n`;
    });
    
    return formattedMessages.join('\n');
  }

  /**
   * Get the number of registered commands
   * 
   * @returns {number} - Number of registered commands
   */
  get commandCount() {
    return this.commands.size;
  }
}

/**
 * Singleton instance of the CommandHandler
 * @type {CommandHandler}
 */
module.exports = new CommandHandler();
