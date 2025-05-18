/**
 * Sensor Data Webhook for Home Assistant
 * Reports information from Home Assistant sensors to WhatsApp users
 * and channel subscribers
 * 
 * @module webhooks/sensorReportWebhook
 */
const { notifySubscribers, logHomeAssistantActivity } = require('./webhookUtils');
const { validateRequiredParams, validateAllowedValues } = require('./validationUtils');

// Store client reference for sending messages
let whatsappClient = null;

// Valid notification channels
const VALID_CHANNELS = ['home', 'security', 'alerts', 'status', 'automation'];

/**
 * Handle sensor report webhook
 * This webhook sends sensor data to specific WhatsApp numbers
 * and optionally to channel subscribers
 * 
 * @async
 * @param {Object} data - Webhook data from Home Assistant
 * @param {string|Object} data.sensor - The sensor data to report (or object with multiple sensors)
 * @param {string|string[]} [data.to] - The number(s) to send to (or "admin" for admin users)
 * @param {string} [data.title='Sensor Report'] - Optional title for the report
 * @param {boolean} [data.notify_subscribers=false] - Whether to notify channel subscribers
 * @param {string} [data.channel='home'] - The channel to notify subscribers on
 * @returns {Object} - Result of the operation with success status and message
 * @throws {Error} - On message sending error
 */
async function handleSensorReportWebhook(data) {
  // Validate client
  if (!whatsappClient) {
    console.error('Sensor report webhook error: WhatsApp client not initialized');
    return { 
      success: false, 
      message: 'WhatsApp client not initialized' 
    };
  }
  
  // Extract parameters with defaults
  const { 
    sensor, 
    to, 
    title = 'Sensor Report',
    notify_subscribers = false,
    channel = 'home'
  } = data;
  
  // Validate sensor data
  if (!sensor) {
    console.error('Sensor report webhook validation error: Missing required parameter: sensor');
    return { 
      success: false, 
      message: 'Missing required parameter: sensor' 
    };
  }
  
  // Validate recipients
  if (!to && !notify_subscribers) {
    console.error('Sensor report webhook validation error: No recipients specified');
    return { 
      success: false, 
      message: 'Missing recipient: specify "to" or enable notify_subscribers' 
    };
  }
  
  // Validate channel if provided explicitly in the request
  if (data.channel) {
    const channelError = validateAllowedValues(channel, VALID_CHANNELS, 'channel');
    if (channelError) {
      console.error(`Sensor report webhook validation error: ${channelError}`);
      return {
        success: false,
        message: channelError
      };
    }
  }
  
  // Log activity for status check
  await logHomeAssistantActivity(`sensor report request for ${typeof sensor === 'object' ? Object.keys(sensor).length : 1} sensor(s)`);
  
  // Format the sensor data into a readable message
  const sensorMessage = formatSensorData(sensor, title);
  
  // Results tracking
  const results = {
    direct_messages: [],
    subscribers: 0
  };
  
  // Send direct messages if 'to' is specified
  if (to) {
    // Determine direct message recipients
    let recipients = getRecipients(to);
    
    // Send direct messages
    for (const number of recipients) {
      try {
        // Format for WhatsApp (add @c.us suffix if needed)
        const chatId = formatWhatsAppId(number);
        
        // Send the message
        await whatsappClient.sendMessage(chatId, sensorMessage);
        
        results.direct_messages.push({ number, status: 'sent' });
      } catch (error) {
        console.error(`Error sending sensor report to ${number}:`, error);
        results.direct_messages.push({ number, status: 'error', error: error.message });
      }
    }
  }
  
  // Notify subscribers if requested
  if (notify_subscribers) {
    try {
      const notifiedCount = await notifySubscribers(channel, sensorMessage);
      results.subscribers = notifiedCount;
    } catch (error) {
      console.error('Error sending notification to subscribers:', error);
      results.subscribers = 0;
    }
  }
  
  return { 
    success: true, 
    message: `Sensor report sent to ${results.direct_messages.filter(r => r.status === 'sent').length} direct recipients and ${results.subscribers} subscribers`,
    results
  };
}

/**
 * Format sensor data into a readable message
 * 
 * @param {Object|string|number} sensor - Sensor data or simple value
 * @param {string} title - Title for the report
 * @returns {string} - Formatted message
 */
function formatSensorData(sensor, title) {
  let message = `*${title}*\n\n`;
  
  if (typeof sensor === 'string' || typeof sensor === 'number') {
    // Simple scalar value
    message += `${sensor}`;
  } else if (typeof sensor === 'object' && sensor !== null) {
    // Complex object with multiple sensors or attributes
    Object.entries(sensor).forEach(([key, value]) => {
      const formattedKey = formatKeyName(key);
      
      if (typeof value === 'object' && value !== null) {
        // For nested objects, format specially
        message += `*${formattedKey}*:\n`;
        Object.entries(value).forEach(([subKey, subValue]) => {
          const formattedSubKey = formatKeyName(subKey);
          message += `  - ${formattedSubKey}: ${subValue}\n`;
        });
      } else {
        // For simple key-value pairs
        message += `*${formattedKey}*: ${value}\n`;
      }
    });
  } else {
    message += 'No sensor data available';
  }
  
  return message;
}

/**
 * Format a key name to be more readable
 * 
 * @param {string} key - The key to format
 * @returns {string} - Formatted key
 */
function formatKeyName(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a phone number for WhatsApp
 * 
 * @param {string} number - The phone number to format
 * @returns {string} - WhatsApp chat ID
 */
function formatWhatsAppId(number) {
  return number.includes('@') ? number : `${number}@c.us`;
}

/**
 * Get recipients based on the 'to' parameter
 * 
 * @param {string|string[]} to - Recipient specification
 * @returns {string[]} - Array of recipient numbers
 */
function getRecipients(to) {
  if (to === 'admin') {
    // Get admin numbers from environment variable
    const adminNumbers = (process.env.ADMIN_NUMBERS || '')
      .split(',')
      .map(num => num.trim())
      .filter(Boolean);
      
    if (adminNumbers.length === 0) {
      console.warn('No admin numbers configured for sensor report webhook');
      return [];
    }
    return adminNumbers;
  } 
  
  return Array.isArray(to) ? to : [to];
}

/**
 * Register the sensor report webhook with webhook handler
 * 
 * @param {Object} webhookHandler - The webhook handler instance
 */
function register(webhookHandler) {
  // External ID will be automatically read from SENSOR_REPORT_WEBHOOK_ID env var if available
  const externalId = process.env.SENSOR_REPORT_WEBHOOK_ID || null;
  webhookHandler.register(
    'sensor_report', 
    handleSensorReportWebhook, 
    'Reports sensor data from Home Assistant to WhatsApp',
    externalId
  );
}

/**
 * Set the WhatsApp client instance for sending messages
 * 
 * @param {Object} client - WhatsApp client instance
 */
function setClient(client) {
  whatsappClient = client;
}

module.exports = {
  register,
  setClient
};
