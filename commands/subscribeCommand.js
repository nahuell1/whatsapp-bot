/**
 * @module commands/subscribeCommand
 * @description Notification subscription command implementation
 * 
 * This module provides the !subscribe and !unsubscribe commands that allow
 * users to manage their notification preferences. Subscriptions are stored
 * in a JSON file and users can subscribe to various notification channels.
 * 
 * @requires fs.promises
 * @requires path
 * @requires ./utils
 */
const fs = require('fs').promises;
const path = require('path');
const { formatMessage, isAdmin } = require('./utils');

/**
 * Path to store subscription data
 * @constant {string}
 */
const SUBSCRIPTIONS_PATH = path.join(__dirname, '../data/subscriptions.json');

/**
 * Available notification channels users can subscribe to
 * @constant {string[]}
 */
const CHANNELS = ['weather', 'home', 'alerts'];

/**
 * Store reference to the WhatsApp client for notifications
 * @type {Object|null}
 * @private
 */
let whatsappClient = null;

/**
 * Ensure data directory exists for storing subscription information
 * 
 * @async
 * @returns {Promise<void>}
 * @private
 */
async function ensureDataDirectory() {
  const dataDir = path.dirname(SUBSCRIPTIONS_PATH);
  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`Ensured data directory exists: ${dataDir}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('Error creating data directory:', error);
      throw new Error(`Failed to create subscription data directory: ${error.message}`);
    }
  }
}

/**
 * Load subscriptions from file or create default structure if file doesn't exist
 * 
 * @async
 * @returns {Promise<Object>} - Subscriptions data with channel information
 * @throws {Error} If subscriptions can't be loaded due to file corruption
 * @private
 */
async function loadSubscriptions() {
  try {
    // Make sure the directory exists
    await ensureDataDirectory();
    
    // Try to read the subscriptions file
    const data = await fs.readFile(SUBSCRIPTIONS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, create default structure
      const defaultData = {
        channels: CHANNELS.reduce((acc, channel) => {
          acc[channel] = [];
          return acc;
        }, {}),
        lastUpdated: new Date().toISOString()
      };
      await saveSubscriptions(defaultData);
      return defaultData;
    }
    console.error('Error loading subscriptions:', error);
    // Return empty structure on error to avoid crashes
    return { channels: {}, lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save subscriptions to persistent storage file
 * 
 * @async
 * @param {Object} data - Subscriptions data with channel information
 * @returns {Promise<void>}
 * @private
 */
async function saveSubscriptions(data) {
  try {
    await ensureDataDirectory();
    
    // Update the lastUpdated field
    data.lastUpdated = new Date().toISOString();
    
    // Write formatted JSON for better human readability
    await fs.writeFile(
      SUBSCRIPTIONS_PATH, 
      JSON.stringify(data, null, 2), 
      'utf8'
    );
    
    console.log(`Subscriptions saved successfully at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('Error saving subscriptions:', error);
    throw new Error(`Failed to save subscription data: ${error.message}`);
  }
}

/**
 * Subscribe a user to a notification channel
 * 
 * @async
 * @param {string} number - User's phone number
 * @param {string} channel - Channel name to subscribe to
 * @returns {Promise<boolean>} - Whether the subscription was successful
 * @throws {Error} If channel doesn't exist or operation fails
 * @private
 */
async function subscribeUser(number, channel) {
  if (!number || !channel) {
    throw new Error('User number and channel are required');
  }
  
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Invalid channel: ${channel}`);
  }
  
  const data = await loadSubscriptions();
  
  // Initialize channel if it doesn't exist
  if (!data.channels[channel]) {
    data.channels[channel] = [];
  }
  
  // Add user if not already subscribed
  if (!data.channels[channel].includes(number)) {
    data.channels[channel].push(number);
    await saveSubscriptions(data);
    return true;
  }
  
  return false; // Already subscribed
}

/**
 * Unsubscribe a user from a notification channel
 * 
 * @async
 * @param {string} number - User's phone number
 * @param {string} channel - Channel name to unsubscribe from
 * @returns {Promise<boolean>} - Whether the unsubscription was successful
 * @throws {Error} If channel doesn't exist or operation fails
 * @private
 */
async function unsubscribeUser(number, channel) {
  if (!number || !channel) {
    throw new Error('User number and channel are required');
  }
  
  const data = await loadSubscriptions();
  
  // Check if channel exists
  if (!data.channels[channel]) {
    return false;
  }
  
  // Find the user in the channel's subscriber list
  const index = data.channels[channel].indexOf(number);
  
  // Remove the user if found
  if (index !== -1) {
    data.channels[channel].splice(index, 1);
    await saveSubscriptions(data);
    return true;
  }
  
  return false; // Not subscribed
}

/**
 * Get all channels a user is subscribed to
 * 
 * @async
 * @param {string} number - User's phone number
 * @returns {Promise<string[]>} - Array of channel names the user is subscribed to
 * @private
 */
async function getUserSubscriptions(number) {
  if (!number) {
    return [];
  }
  
  const data = await loadSubscriptions();
  
  // Find all channels that include this user's number
  return Object.keys(data.channels).filter(channel => 
    data.channels[channel].includes(number)
  );
}

/**
 * Send a message to all subscribers of a specific channel
 * 
 * @async
 * @param {string} channel - Channel name to notify
 * @param {string} message - Message to send to subscribers
 * @returns {Promise<number>} - Number of recipients the message was sent to
 * @throws {Error} If WhatsApp client is not initialized
 * @private
 */
async function notifySubscribers(channel, message) {
  // Validate WhatsApp client is available
  if (!whatsappClient) {
    throw new Error('WhatsApp client not initialized');
  }
  
  // Load current subscription data
  const data = await loadSubscriptions();
  
  // Check if the channel exists
  if (!data.channels[channel]) {
    console.warn(`Attempted to notify subscribers of non-existent channel: ${channel}`);
    return 0;
  }
  
  const subscribers = data.channels[channel];
  let sentCount = 0;
  
  for (const number of subscribers) {
    try {
      // Use WhatsApp client to send message
      const chatId = `${number}@c.us`; // Format for WhatsApp IDs
      await whatsappClient.sendMessage(chatId, message);
      sentCount++;
    } catch (error) {
      console.error(`Error sending notification to ${number}:`, error);
    }
  }
  
  return sentCount;
}

/**
 * Handle subscription/unsubscription
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments
 */
async function handleSubscribeCommand(msg, args) {
  const contact = await msg.getContact();
  const number = contact.number;
  
  const [action, channel] = args.toLowerCase().trim().split(/\s+/);
  
  if (!action || !['list', 'add', 'remove', 'notify'].includes(action)) {
    msg.reply(formatMessage({
      title: '📢 Suscripciones',
      body: 'Comandos disponibles:',
      items: [
        '!suscribir list - Ver tus suscripciones',
        '!suscribir add [canal] - Suscribirse a un canal',
        '!suscribir remove [canal] - Eliminar una suscripción'
      ],
      footer: `Canales disponibles: ${CHANNELS.join(', ')}`
    }));
    return;
  }
  
  // List the user's current subscriptions
  if (action === 'list') {
    try {
      const subscriptions = await getUserSubscriptions(number);
      
      if (subscriptions.length === 0) {
        await msg.reply(formatMessage({
          title: '📢 Suscripciones',
          body: 'No estás suscrito a ningún canal.',
          footer: `Canales disponibles: ${CHANNELS.join(', ')}`
        }));
      } else {
        await msg.reply(formatMessage({
          title: '📢 Tus suscripciones',
          items: subscriptions.map(ch => `• ${ch}`),
          footer: 'Usa "!suscribir remove [canal]" para eliminar una suscripción'
        }));
      }
    } catch (error) {
      console.error('Error listing subscriptions:', error);
      await msg.reply('Error al obtener tus suscripciones. Intenta nuevamente.');
    }
    return;
  }
  
  // Notify subscribers (admin only permission)
  if (action === 'notify') {
    try {
      // Check if user has admin permissions
      if (!isAdmin(number)) {
        await msg.reply(formatMessage({
          title: '⛔ Acceso denegado',
          body: 'No tienes permisos para enviar notificaciones.'
        }));
        return;
      }
      
      // Parse the notification message from arguments
      const [targetChannel, ...messageParts] = args.slice(7).trim().split(/\s+/);
      const notificationMessage = messageParts.join(' ');
      
      // Validate input
      if (!targetChannel || !CHANNELS.includes(targetChannel) || !notificationMessage) {
        await msg.reply(formatMessage({
          title: '⚠️ Formato incorrecto',
          body: 'Uso: !suscribir notify [canal] [mensaje]',
          footer: `Canales disponibles: ${CHANNELS.join(', ')}`
        }));
        return;
      }
      
      // Send the notification to subscribers
      const count = await notifySubscribers(targetChannel, notificationMessage);
      
      // Confirm the action
      await msg.reply(formatMessage({
        title: '✅ Notificación enviada',
        body: `Se ha enviado tu mensaje a ${count} suscriptores del canal "${targetChannel}".`
      }));
    } catch (error) {
      console.error('Error sending notification:', error);
      await msg.reply(`Error al enviar notificación: ${error.message}`);
    }
    return;
  }
  
  // Add/remove subscription
  if (!channel || !CHANNELS.includes(channel)) {
    msg.reply(`Canal inválido. Canales disponibles: ${CHANNELS.join(', ')}`);
    return;
  }
  
  if (action === 'add') {
    const success = await subscribeUser(number, channel);
    if (success) {
      msg.reply(`✅ Te has suscrito al canal: ${channel}`);
    } else {
      msg.reply(`Ya estás suscrito al canal: ${channel}`);
    }
  } else if (action === 'remove') {
    const success = await unsubscribeUser(number, channel);
    if (success) {
      msg.reply(`✅ Te has dado de baja del canal: ${channel}`);
    } else {
      msg.reply(`No estabas suscrito al canal: ${channel}`);
    }
  }
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!suscribir', handleSubscribeCommand, 'Gestionar suscripciones a notificaciones');
  },
  
  setClient: (client) => {
    whatsappClient = client;
  },
  
  // Export notification function for use in other commands
  notifySubscribers
};
