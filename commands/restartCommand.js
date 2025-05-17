/**
 * Restart Command for WhatsApp Bot
 * Allows administrators to restart the bot
 */
const { exec } = require('child_process');
const path = require('path');
const { isAdmin, formatMessage } = require('./utils');

// Store reference to the WhatsApp client
let whatsappClient = null;

/**
 * Handle restart command
 * @param {object} msg - WhatsApp message object
 */
async function handleRestartCommand(msg) {
  const contact = await msg.getContact();
  const sender = contact.number;
  
  // Check if sender is an admin
  if (!isAdmin(sender)) {
    msg.reply(formatMessage({
      title: '⛔ Acceso denegado',
      body: 'No tienes permisos para reiniciar el bot.'
    }));
    return;
  }
  
  // Confirm restart
  msg.reply(formatMessage({
    title: '🔄 Reiniciando',
    body: 'El bot se reiniciará en unos segundos...',
    footer: 'Este proceso puede tardar hasta 30 segundos'
  }));
  console.log(`Bot restart requested by admin ${sender}`);
  
  // Give time for the message to be sent
  setTimeout(() => {
    // If running in a Node.js process directly, restart the process
    if (process.env.NODE_ENV !== 'production') {
      // In development mode, we can just exit and let a process manager restart us
      console.log('Exiting for restart...');
      process.exit(0);
    } else {
      // In production mode, we can use PM2 to restart
      const scriptPath = path.join(__dirname, '../restart-bot.sh');
      
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
  }, 1000);
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!restart', handleRestartCommand, 'Restart the bot (admin only)');
  },
  
  // Method to set the client reference
  setClient: (client) => {
    whatsappClient = client;
  }
};
