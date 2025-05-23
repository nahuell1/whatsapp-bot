/**
 * @module commands/messageFilter
 * @description Message filtering functionality for the WhatsApp bot
 * 
 * This module provides message filtering to restrict access based on phone numbers.
 * It ensures that only authorized users (admin numbers) can interact with the bot.
 * 
 * @requires ./utils
 */
const { isAdmin } = require('./utils');

/**
 * Check if a message is from an authorized user
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @returns {Promise<boolean>} - Whether the sender is authorized
 */
async function isAuthorizedSender(msg) {
  try {
    const contact = await msg.getContact();
    const sender = contact.number;
    return isAdmin(sender);
  } catch (error) {
    console.error('Error checking message authorization:', error);
    return false;
  }
}

module.exports = {
  isAuthorizedSender
};
