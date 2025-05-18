/**
 * @module commands/index
 * @description Central registry for all available WhatsApp bot commands.
 * 
 * This module dynamically loads all command modules in the directory and
 * registers them with the command handler. It also provides a method to
 * set the WhatsApp client reference in commands that need direct access.
 * 
 * @requires fs
 * @requires path
 * @requires ./commandHandler
 */

const fs = require('fs');
const path = require('path');
const commandHandler = require('./commandHandler');

/**
 * Store loaded command modules for reference and management
 * @type {Map<string, Object>}
 */
const commandModules = new Map();

/**
 * Dynamically load and register all command modules from this directory
 * @throws {Error} If command loading fails
 */
function loadCommands() {
  // Get all command files, excluding utility and handler files
  const commandFiles = fs
    .readdirSync(__dirname)
    .filter(file => 
      file !== 'commandHandler.js' && 
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.startsWith('template')  // Skip template files
    );

  console.log('Loading commands:', commandFiles);
  
  // Load each command module
  for (const file of commandFiles) {
    try {
      const command = require(path.join(__dirname, file));
      
      // Each command module should export a register function
      if (typeof command.register === 'function') {
        command.register(commandHandler);
        // Store reference to the command module
        commandModules.set(file, command);
      } else {
        console.warn(`Command file ${file} does not export a register function`);
      }
    } catch (error) {
      console.error(`Error loading command from ${file}:`, error);
    }
  }
  
  console.log(`Loaded ${commandHandler.commands.size} commands`);
}

/**
 * Set the WhatsApp client reference in commands that need direct client access
 * @param {Object} client - WhatsApp client instance
 * @throws {Error} If client is not a valid object
 */
function setClientInCommands(client) {
  if (!client || typeof client !== 'object') {
    throw new Error('Invalid WhatsApp client provided to command modules');
  }
  
  // Pass client to all commands that support it via setClient method
  for (const command of commandModules.values()) {
    if (typeof command.setClient === 'function') {
      command.setClient(client);
    }
  }
}

// Initialize by loading all commands during module import
loadCommands();

// Add the setClientInCommands method to the command handler for external use
commandHandler.setClientInCommands = setClientInCommands;

/**
 * Export the command handler with all registered commands
 * @type {Object}
 */
module.exports = commandHandler;
