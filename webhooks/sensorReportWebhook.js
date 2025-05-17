/**
 * Sensor Data Webhook for Home Assistant
 * Reports information from Home Assistant sensors to WhatsApp
 */
const { notifySubscribers } = require('./webhookUtils');

// Store client reference for sending messages
let whatsappClient = null;

/**
 * Handle sensor report webhook
 * This webhook sends sensor data to specific WhatsApp numbers
 * 
 * @param {object} data - Webhook data from Home Assistant
 * @param {string|object} data.sensor - The sensor data to report (or object with multiple sensors)
 * @param {string|string[]} data.to - The number(s) to send to (or "admin" for admin users)
 * @param {string} [data.title] - Optional title for the report
 * @param {boolean} [data.notify_subscribers=false] - Whether to notify channel subscribers
 * @param {string} [data.channel='home'] - The channel to notify subscribers on
 * @returns {object} - Result of the operation
 */
async function handleSensorReportWebhook(data) {
  // Validate client
  if (!whatsappClient) {
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
  
  // Validate parameters
  if (!sensor) {
    return { 
      success: false, 
      message: 'Missing required parameter: sensor' 
    };
  }
  
  if (!to && !notify_subscribers) {
    return { 
      success: false, 
      message: 'Missing recipient: specify "to" or enable notify_subscribers' 
    };
  }
  
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
    let recipients = [];
    
    if (to === 'admin') {
      // Get admin numbers from environment variable
      const adminNumbers = (process.env.ADMIN_NUMBERS || '')
        .split(',')
        .map(num => num.trim())
        .filter(Boolean);
        
      if (adminNumbers.length === 0) {
        console.warn('No admin numbers configured for sensor report webhook');
      } else {
        recipients = adminNumbers;
      }
    } else if (Array.isArray(to)) {
      recipients = to;
    } else {
      recipients = [to];
    }
    
    // Send direct messages
    for (const number of recipients) {
      try {
        // Format for WhatsApp (add @c.us suffix if needed)
        const chatId = number.includes('@') ? number : `${number}@c.us`;
        
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
 * @param {object|string} sensor - Sensor data or simple value
 * @param {string} title - Title for the report
 * @returns {string} - Formatted message
 */
function formatSensorData(sensor, title) {
  let message = `*${title}*\n\n`;
  
  if (typeof sensor === 'string' || typeof sensor === 'number') {
    // Simple scalar value
    message += `${sensor}`;
  } else if (typeof sensor === 'object') {
    // Complex object with multiple sensors or attributes
    Object.entries(sensor).forEach(([key, value]) => {
      const formattedKey = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      
      if (typeof value === 'object' && value !== null) {
        // For nested objects, format specially
        message += `*${formattedKey}*:\n`;
        Object.entries(value).forEach(([subKey, subValue]) => {
          const formattedSubKey = subKey
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
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

module.exports = {
  register: (webhookHandler) => {
    // External ID will be automatically read from SENSOR_REPORT_WEBHOOK_ID env var if available
    const externalId = process.env.SENSOR_REPORT_WEBHOOK_ID || null;
    webhookHandler.register(
      'sensor_report', 
      handleSensorReportWebhook, 
      'Reports sensor data from Home Assistant to WhatsApp',
      externalId
    );
  },
  
  setClient: (client) => {
    whatsappClient = client;
  }
};
