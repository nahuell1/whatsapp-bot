/**
 * Webhook utilities
 * Shared utility functions for webhook handlers
 */
const { safeApiRequest } = require('../commands/utils');

// Configuration from environment variables
const CONFIG = {
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123'
};

// Store references to shared functionality
const shared = {
  // Function to notify subscribers (will be set by the notification system)
  notifySubscribers: null
};

/**
 * Set the notifier function that can be used by webhooks
 * @param {Function} notifier - The notification function
 */
function setNotifier(notifier) {
  shared.notifySubscribers = notifier;
}

/**
 * Notify subscribers of a channel with a message
 * @param {string} channel - The channel to notify
 * @param {string} message - The message to send
 * @returns {Promise<number>} - Number of recipients notified
 */
async function notifySubscribers(channel, message) {
  if (!shared.notifySubscribers) {
    console.warn('Notification system not available');
    return 0;
  }
  
  try {
    return await shared.notifySubscribers(channel, message);
  } catch (error) {
    console.error('Error in webhook notification:', error);
    return 0;
  }
}

/**
 * Log Home Assistant activity
 * @param {string} activity - Activity description
 */
async function logHomeAssistantActivity(activity) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const logFile = path.join(__dirname, 'ha_activity.log');
    
    await fs.writeFile(
      logFile, 
      `Home Assistant ${activity} - ${new Date().toISOString()}\n`, 
      'utf8'
    );
  } catch (err) {
    console.error('Error logging Home Assistant activity:', err);
  }
}

/**
 * Call a Home Assistant webhook using the external ID
 * @param {string} externalId - The external webhook ID to use
 * @param {object} data - Data to send to the webhook
 * @returns {Promise<object>} - Response from Home Assistant
 */
async function callHomeAssistantWebhook(externalId, data) {
  if (!externalId) {
    throw new Error('No webhook ID provided');
  }
  
  const webhookUrl = `${CONFIG.HOMEASSISTANT_URL}/api/webhook/${externalId}`;
  console.log(`Calling Home Assistant webhook at: ${webhookUrl}`);
  
  try {
    const response = await safeApiRequest(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, 10000); // 10 second timeout
    
    return response;
  } catch (error) {
    console.error('Error calling Home Assistant webhook:', error);
    throw error;
  }
}

module.exports = {
  setNotifier,
  notifySubscribers,
  logHomeAssistantActivity,
  callHomeAssistantWebhook
};
