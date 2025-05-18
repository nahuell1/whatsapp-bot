/**
 * Notification Webhook for Home Assistant
 * Sends notifications to WhatsApp from Home Assistant
 * 
 * @module webhooks/notificationWebhook
 */
const { logHomeAssistantActivity } = require('./webhookUtils');
const { validateRequiredParams } = require('./validationUtils');

// Store client reference for sending messages
let whatsappClient = null;

/**
 * Handle notification webhook
 * This webhook sends WhatsApp messages to specified numbers
 * 
 * @async
 * @param {Object} data - Webhook data from Home Assistant
 * @param {string} data.message - The message to send
 * @param {string|string[]} data.to - The number(s) to send to (or "admin" for admin users)
 * @param {string} [data.title] - Optional title for the message
 * @returns {Object} - Result of the operation with success status and message
 * @throws {Error} - On message sending error
 */
async function handleNotificationWebhook(data) {
  // Check client initialization
  if (!whatsappClient) {
    console.error('Notification webhook error: WhatsApp client not initialized');
    return { 
      success: false, 
      message: 'WhatsApp client not initialized' 
    };
  }
  
  // Validate required parameters
  const validationError = validateRequiredParams(data, ['message', 'to']);
  if (validationError) {
    console.error(`Notification webhook validation error: ${validationError}`);
    return { 
      success: false, 
      message: validationError 
    };
  }
  
  const { message, to, title } = data;
  
  // Determine recipients
  let recipients = [];
  
  if (to === 'admin') {
    // Get admin numbers from environment variable
    const adminNumbers = getAdminNumbers();
      
    if (adminNumbers.length === 0) {
      console.error('Notification webhook error: No admin numbers configured');
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
  const formattedMessage = formatNotificationMessage(message, title);
    
  // Send messages
  const results = [];
  
  for (const number of recipients) {
    try {
      // Format for WhatsApp (add @c.us suffix if needed)
      const chatId = formatWhatsAppId(number);
      
      // Send the message
      await whatsappClient.sendMessage(chatId, formattedMessage);
      
      results.push({ number, status: 'sent' });
    } catch (error) {
      console.error(`Error sending message to ${number}:`, error);
      results.push({ number, status: 'error', error: error.message });
    }
  }
  
  // Count successful messages
  const successCount = results.filter(r => r.status === 'sent').length;
  
  // Log activity for status check
  await logHomeAssistantActivity(`notification sent to ${successCount} recipients`);
  
  return { 
    success: true, 
    message: `Notifications sent to ${successCount} recipients`,
    results
  };
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
 * Get admin numbers from environment variables
 * 
 * @returns {string[]} - Array of admin phone numbers
 */
function getAdminNumbers() {
  return (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(num => num.trim())
    .filter(Boolean);
}

/**
 * Format a notification message with optional title
 * 
 * @param {string} message - The message body
 * @param {string} [title] - Optional message title
 * @returns {string} - Formatted message
 */
function formatNotificationMessage(message, title) {
  return title ? `*${title}*\n\n${message}` : message;
}

/**
 * Register the notification webhook with webhook handler
 * 
 * @param {Object} webhookHandler - The webhook handler instance
 */
function register(webhookHandler) {
  // External ID will be automatically read from SEND_NOTIFICATION_WEBHOOK_ID env var if available
  const externalId = process.env.SEND_NOTIFICATION_WEBHOOK_ID || null;
  webhookHandler.register(
    'send_notification', 
    handleNotificationWebhook, 
    'Sends WhatsApp notifications to specified recipients',
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
