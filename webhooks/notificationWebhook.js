/**
 * Notification Webhook for Home Assistant
 * Sends notifications to WhatsApp from Home Assistant
 */
const { logHomeAssistantActivity } = require('./webhookUtils');

// Store client reference for sending messages
let whatsappClient = null;

/**
 * Handle notification webhook
 * This webhook sends WhatsApp messages to specified numbers
 * 
 * @param {object} data - Webhook data from Home Assistant
 * @param {string} data.message - The message to send
 * @param {string|string[]} data.to - The number(s) to send to (or "admin" for admin users)
 * @param {string} [data.title] - Optional title for the message
 * @returns {object} - Result of the operation
 */
async function handleNotificationWebhook(data) {
  if (!whatsappClient) {
    return { 
      success: false, 
      message: 'WhatsApp client not initialized' 
    };
  }
  
  const { message, to, title } = data;
  
  if (!message) {
    return { 
      success: false, 
      message: 'Missing required parameter: message' 
    };
  }
  
  if (!to) {
    return { 
      success: false, 
      message: 'Missing required parameter: to' 
    };
  }
  
  // Determine recipients
  let recipients = [];
  
  if (to === 'admin') {
    // Get admin numbers from environment variable
    const adminNumbers = (process.env.ADMIN_NUMBERS || '')
      .split(',')
      .map(num => num.trim())
      .filter(Boolean);
      
    if (adminNumbers.length === 0) {
      return { 
        success: false, 
        message: 'No admin numbers configured' 
      };
    }
    
    recipients = adminNumbers;
  } else if (Array.isArray(to)) {
    recipients = to;
  } else {
    recipients = [to];
  }
  
  // Format message
  const formattedMessage = title 
    ? `*${title}*\n\n${message}`
    : message;
    
  // Send messages
  const results = [];
  
  for (const number of recipients) {
    try {
      // Format for WhatsApp (add @c.us suffix if needed)
      const chatId = number.includes('@') ? number : `${number}@c.us`;
      
      // Send the message
      await whatsappClient.sendMessage(chatId, formattedMessage);
      
      results.push({ number, status: 'sent' });
    } catch (error) {
      console.error(`Error sending message to ${number}:`, error);
      results.push({ number, status: 'error', error: error.message });
    }
  }
  
  // Log activity for status check
  await logHomeAssistantActivity(`notification sent to ${results.filter(r => r.status === 'sent').length} recipients`);
  
  return { 
    success: true, 
    message: `Notifications sent to ${results.filter(r => r.status === 'sent').length} recipients`,
    results
  };
}

module.exports = {
  register: (webhookHandler) => {
    // External ID will be automatically read from SEND_NOTIFICATION_WEBHOOK_ID env var if available
    const externalId = process.env.SEND_NOTIFICATION_WEBHOOK_ID || null;
    webhookHandler.register(
      'send_notification', 
      handleNotificationWebhook, 
      'Sends WhatsApp notifications to specified recipients',
      externalId
    );
  },
  
  setClient: (client) => {
    whatsappClient = client;
  }
};
