/**
 * Webhooks index file
 * Registers and loads all webhook handlers
 */
const fs = require('fs');
const path = require('path');
const webhookHandler = require('./webhookHandler');

/**
 * Dynamically load and register all webhook modules
 */
function loadWebhooks() {
  const webhookFiles = fs
    .readdirSync(__dirname)
    .filter(file => 
      file !== 'webhookHandler.js' && 
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.startsWith('template')
    );

  console.log('Loading webhook handlers:', webhookFiles);
  
  for (const file of webhookFiles) {
    try {
      const webhook = require(path.join(__dirname, file));
      
      // Each webhook module should export a register function
      if (typeof webhook.register === 'function') {
        webhook.register(webhookHandler);
        // Store reference to the webhook module
        webhookModules.set(file, webhook);
      } else {
        console.warn(`Webhook file ${file} does not export a register function`);
      }
    } catch (error) {
      console.error(`Error loading webhook from ${file}:`, error);
    }
  }
  
  console.log(`Loaded ${webhookHandler.getWebhookIds().length} webhook handlers`);
}

// Store loaded webhook modules for reference
const webhookModules = new Map();

/**
 * Set the WhatsApp client reference in webhooks that need it
 * @param {object} client - WhatsApp client instance
 */
function setClientInWebhooks(client) {
  for (const webhook of webhookModules.values()) {
    if (typeof webhook.setClient === 'function') {
      webhook.setClient(client);
    }
  }
}

// Load all webhooks
loadWebhooks();

// Add the setClientInWebhooks function to the webhookHandler
webhookHandler.setClientInWebhooks = setClientInWebhooks;

module.exports = webhookHandler;
