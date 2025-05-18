/**
 * Webhook Utilities Module
 * Shared utility functions for webhook handlers
 * 
 * @module webhooks/webhookUtils
 */
const { safeApiRequest } = require('../commands/utils');

/**
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  /** @type {string} Home Assistant URL */
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123'
};

/**
 * Store references to shared functionality that will be injected
 * @private
 */
const shared = {
  /** @type {Function|null} Function to notify subscribers */
  notifySubscribers: null
};

/**
 * Set the notifier function that can be used by webhooks
 * 
 * @param {Function} notifier - The notification function
 * @throws {TypeError} If notifier is not a function
 */
function setNotifier(notifier) {
  if (typeof notifier !== 'function') {
    throw new TypeError('Notifier must be a function');
  }
  shared.notifySubscribers = notifier;
}

/**
 * Notify subscribers of a channel with a message
 * 
 * @async
 * @param {string} channel - The channel to notify
 * @param {string} message - The message to send
 * @returns {Promise<number>} Number of recipients notified
 * @throws {Error} Will not throw, but logs errors
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
 * Log Home Assistant activity to the activity log file
 * 
 * @async
 * @param {string} activity - Activity description
 * @returns {Promise<void>}
 */
async function logHomeAssistantActivity(activity) {
  // Import fs and path only when needed (lazy loading)
  const fs = require('fs').promises;
  const path = require('path');
  const logFile = path.join(__dirname, 'ha_activity.log');
  const timestamp = new Date().toISOString();
  const logEntry = `Home Assistant ${activity} - ${timestamp}\n`;
  
  try {
    await fs.appendFile(logFile, logEntry, 'utf8');
  } catch (err) {
    console.error('Error logging Home Assistant activity:', err);
  }
}

/**
 * Call a Home Assistant webhook using the external ID
 * 
 * @async
 * @param {string} externalId - The external webhook ID to use
 * @param {Object} data - Data to send to the webhook
 * @returns {Promise<Object>} Response from Home Assistant
 * @throws {Error} If webhook ID is missing or request fails
 */
async function callHomeAssistantWebhook(externalId, data) {
  if (!externalId) {
    throw new Error('No webhook ID provided');
  }
  
  const webhookUrl = `${CONFIG.HOMEASSISTANT_URL}/api/webhook/${externalId}`;
  console.log(`Calling Home Assistant webhook at: ${webhookUrl}`);
  
  try {
    // Send the webhook request with a 10-second timeout
    return await safeApiRequest(
      webhookUrl, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      },
      10000 // 10 second timeout
    );
  } catch (error) {
    console.error('Error calling Home Assistant webhook:', error);
    throw error; // Re-throw to allow the caller to handle the error
  }
}

module.exports = {
  setNotifier,
  notifySubscribers,
  logHomeAssistantActivity,
  callHomeAssistantWebhook
};
