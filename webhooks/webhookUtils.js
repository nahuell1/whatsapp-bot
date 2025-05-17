/**
 * Webhook utilities
 * Shared utility functions for webhook handlers
 */

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

module.exports = {
  setNotifier,
  notifySubscribers,
  logHomeAssistantActivity
};
