/**
 * Commands index file
 * Registers all available commands
 */
const fs = require('fs');
const path = require('path');
const commandHandler = require('./commandHandler');

// Store loaded command modules for reference
const commandModules = new Map();

/**
 * Dynamically load and register all command modules
 */
function loadCommands() {
  const commandFiles = fs
    .readdirSync(__dirname)
    .filter(file => 
      file !== 'commandHandler.js' && 
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.startsWith('template')  // Skip template files
    );

  console.log('Loading commands:', commandFiles);
  
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
 * Set the WhatsApp client reference in commands that need it
 * @param {object} client - WhatsApp client instance
 */
function setClientInCommands(client) {
  for (const command of commandModules.values()) {
    if (typeof command.setClient === 'function') {
      command.setClient(client);
    }
  }
}

// Load all commands
loadCommands();

// Exportamos el manejador de comandos directamente y añadimos el método setClientInCommands
commandHandler.setClientInCommands = setClientInCommands;
module.exports = commandHandler;
