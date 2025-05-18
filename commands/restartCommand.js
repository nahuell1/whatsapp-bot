/**
 * @module commands/restartCommand
 * @description Restart command implementation for the WhatsApp bot
 * 
 * This module provides the !restart command that allows administrators
 * to restart the bot. It includes security checks to ensure only
 * authorized users can trigger a restart.
 * 
 * @requires child_process
 * @requires path
 * @requires ./utils
 */
const { exec } = require('child_process');
const path = require('path');
const { isAdmin, formatMessage } = require('./utils');

/**
 * Store reference to the WhatsApp client
 * @type {Object|null}
 * @private
 */
let whatsappClient = null;

/**
 * Handle restart command request
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {Function} msg.getContact - Function to get contact info
 * @param {string} args - Command arguments (not used for restart command)
 * @returns {Promise<void>}
 */
async function handleRestartCommand(msg, args) {
  try {
    // Get sender information for authentication
    const contact = await msg.getContact();
    const sender = contact.number;
    
    // Check if sender is an admin
    if (!isAdmin(sender)) {
      await msg.reply(formatMessage({
        title: '⛔ Acceso denegado',
        body: 'No tienes permisos para reiniciar el bot.'
      }));
      console.log(`Unauthorized restart attempt by ${sender}`);
      return;
    }
  
  // Confirm restart
  await msg.reply(formatMessage({
    title: '🔄 Reiniciando',
    body: 'El bot se reiniciará en unos segundos...',
    footer: 'Este proceso puede tardar hasta 30 segundos'
  }));
  console.log(`Bot restart requested by admin ${sender}`);
  
  // Give time for the message to be sent
  setTimeout(() => {
    try {
      // If running in a Node.js process directly, restart the process
      if (process.env.NODE_ENV !== 'production') {
        // In development mode, we can just exit and let a process manager restart us
        console.log('Exiting for restart in development mode...');
        process.exit(0);
      } else {
        // In production mode, we can use PM2 to restart
        const scriptPath = path.join(__dirname, '../restart-bot.sh');
        console.log(`Executing restart script: ${scriptPath}`);
        
        exec(`bash ${scriptPath}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Restart error: ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`Restart stderr: ${stderr}`);
          }
          console.log(`Restart stdout: ${stdout}`);
        });
      }
    } catch (error) {
      console.error('Failed to execute restart:', error);
    }
  }, 1000); // Wait 1 second to ensure the message is sent
  }
  catch (error) {
    console.error('Error in restart command:', error);
    await msg.reply('Error al reiniciar: ' + error.message);
  }
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Register this command with the command handler
   * @param {Object} commandHandler - Command handler instance
   */
  register: (commandHandler) => {
    commandHandler.register('!restart', handleRestartCommand, 'Restart the bot (admin only)');
  },
  
  /**
   * Set the WhatsApp client reference
   * @param {Object} client - WhatsApp client instance
   */
  setClient: (client) => {
    whatsappClient = client;
  }
};
