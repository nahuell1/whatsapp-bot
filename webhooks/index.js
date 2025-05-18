/**
 * Webhooks Index Module
 * Dynamically registers and manages all webhook handlers
 * 
 * @module webhooks/index
 */
const fs = require('fs');
const path = require('path');
const webhookHandler = require('./webhookHandler');

// Store loaded webhook modules for reference
const webhookModules = new Map();

/**
 * Dynamically load and register all webhook modules
 * Scans the webhook directory for handler files and registers them
 */
function loadWebhooks() {
  const webhookFiles = fs
    .readdirSync(__dirname)
    .filter(file => 
      file !== 'webhookHandler.js' && 
      file !== 'index.js' &&
      file !== 'webhookUtils.js' &&
      file !== 'validationUtils.js' &&
      file.endsWith('.js') &&
      !file.startsWith('template')
    );

  console.log(`Found ${webhookFiles.length} webhook handler files to load`);
  
  for (const file of webhookFiles) {
    try {
      const webhook = require(path.join(__dirname, file));
      
      // Each webhook module should export a register function
      if (typeof webhook.register === 'function') {
        webhook.register(webhookHandler);
        // Store reference to the webhook module
        webhookModules.set(file, webhook);
        console.log(`Successfully registered webhook from ${file}`);
      } else {
        console.warn(`Webhook file ${file} does not export a register function`);
      }
    } catch (error) {
      console.error(`Error loading webhook from ${file}:`, error);
    }
  }
  
  try {
    // Get webhook count
    const webhookCount = webhookHandler.getWebhookIds().length;
    const webhookInfo = webhookHandler.getWebhooksInfo();
    
    console.log(`Loaded ${webhookCount} webhook handlers`);
    console.log('Available webhooks:');
    webhookInfo.forEach(webhook => {
      console.log(`- ${webhook.name} (${webhook.externalId}): ${webhook.description}`);
    });
  } catch (error) {
    console.error('Error processing webhooks:', error);
  }
}

/**
 * Set the WhatsApp client reference in webhooks that need it
 * 
 * @param {Object} client - WhatsApp client instance
 */
function setClientInWebhooks(client) {
  if (!client) {
    console.warn('Attempting to set null or undefined client in webhooks');
    return;
  }

  console.log('Setting WhatsApp client in webhook modules');
  
  for (const [fileName, webhook] of webhookModules.entries()) {
    if (typeof webhook.setClient === 'function') {
      webhook.setClient(client);
      console.log(`Set client in webhook module: ${fileName}`);
    }
  }
}

// Load all webhooks
loadWebhooks();

// Add the setClientInWebhooks function to the webhookHandler
webhookHandler.setClientInWebhooks = setClientInWebhooks;

module.exports = webhookHandler;
