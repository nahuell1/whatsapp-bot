/**
 * Notification Subscription Command for WhatsApp Bot
 * Allows users to subscribe to different notification channels
 */
const fs = require('fs').promises;
const path = require('path');
const { formatMessage, isAdmin } = require('./utils');

// Path to store subscriptions
const SUBSCRIPTIONS_PATH = path.join(__dirname, '../data/subscriptions.json');

// Available notification channels
const CHANNELS = ['weather', 'home', 'alerts'];

// Store client reference for sending notifications
let whatsappClient = null;

/**
 * Ensure data directory exists
 */
async function ensureDataDirectory() {
  const dataDir = path.dirname(SUBSCRIPTIONS_PATH);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('Error creating data directory:', error);
    }
  }
}

/**
 * Load subscriptions from file
 * @returns {Object} - Subscriptions data
 */
async function loadSubscriptions() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(SUBSCRIPTIONS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, create default structure
      const defaultData = {
        channels: CHANNELS.reduce((acc, channel) => {
          acc[channel] = [];
          return acc;
        }, {})
      };
      await saveSubscriptions(defaultData);
      return defaultData;
    }
    console.error('Error loading subscriptions:', error);
    return { channels: {} };
  }
}

/**
 * Save subscriptions to file
 * @param {Object} data - Subscriptions data
 */
async function saveSubscriptions(data) {
  try {
    await ensureDataDirectory();
    await fs.writeFile(SUBSCRIPTIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving subscriptions:', error);
  }
}

/**
 * Subscribe a user to a channel
 * @param {string} number - User's phone number
 * @param {string} channel - Channel name
 * @returns {boolean} - Whether the operation was successful
 */
async function subscribeUser(number, channel) {
  const data = await loadSubscriptions();
  
  if (!data.channels[channel]) {
    data.channels[channel] = [];
  }
  
  if (!data.channels[channel].includes(number)) {
    data.channels[channel].push(number);
    await saveSubscriptions(data);
    return true;
  }
  
  return false; // Already subscribed
}

/**
 * Unsubscribe a user from a channel
 * @param {string} number - User's phone number
 * @param {string} channel - Channel name
 * @returns {boolean} - Whether the operation was successful
 */
async function unsubscribeUser(number, channel) {
  const data = await loadSubscriptions();
  
  if (!data.channels[channel]) {
    return false;
  }
  
  const index = data.channels[channel].indexOf(number);
  if (index !== -1) {
    data.channels[channel].splice(index, 1);
    await saveSubscriptions(data);
    return true;
  }
  
  return false; // Not subscribed
}

/**
 * Get all channels a user is subscribed to
 * @param {string} number - User's phone number
 * @returns {string[]} - Subscribed channels
 */
async function getUserSubscriptions(number) {
  const data = await loadSubscriptions();
  
  return Object.keys(data.channels).filter(channel => 
    data.channels[channel].includes(number)
  );
}

/**
 * Send a message to all subscribers of a channel
 * @param {string} channel - Channel name
 * @param {string} message - Message to send
 * @returns {Promise<number>} - Number of recipients
 */
async function notifySubscribers(channel, message) {
  if (!whatsappClient) {
    throw new Error('WhatsApp client not initialized');
  }
  
  const data = await loadSubscriptions();
  
  if (!data.channels[channel]) {
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
  
  // List subscriptions
  if (action === 'list') {
    const subscriptions = await getUserSubscriptions(number);
    
    if (subscriptions.length === 0) {
      msg.reply('No estás suscrito a ningún canal.');
    } else {
      msg.reply(formatMessage({
        title: '📢 Tus suscripciones',
        items: subscriptions.map(ch => `• ${ch}`),
        footer: 'Usa "!suscribir remove [canal]" para eliminar una suscripción'
      }));
    }
    return;
  }
  
  // Notify subscribers (admin only)
  if (action === 'notify') {
    if (!isAdmin(number)) {
      msg.reply('⛔ No tienes permisos para notificar.');
      return;
    }
    
    const [targetChannel, ...messageParts] = args.slice(7).trim().split(/\s+/);
    const notificationMessage = messageParts.join(' ');
    
    if (!targetChannel || !CHANNELS.includes(targetChannel) || !notificationMessage) {
      msg.reply('Uso: !suscribir notify [canal] [mensaje]');
      return;
    }
    
    const count = await notifySubscribers(targetChannel, notificationMessage);
    msg.reply(`✅ Notificación enviada a ${count} suscriptores del canal "${targetChannel}".`);
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
