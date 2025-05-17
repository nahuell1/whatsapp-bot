/**
 * Device Control Webhook for Home Assistant
 * Controls individual devices via webhook with service selection
 */
const { notifySubscribers } = require('./webhookUtils');

/**
 * Handle device control webhook
 * This webhook controls individual devices using domain/service calls
 * 
 * @param {object} data - Webhook data from Home Assistant
 * @param {string} data.entity_id - The entity ID to control (e.g., light.kitchen, switch.tv)
 * @param {string} data.domain - The domain of the entity (e.g., light, switch, media_player)
 * @param {string} data.service - The service to call (e.g., turn_on, turn_off, toggle)
 * @param {object} [data.service_data] - Optional service data parameters
 * @param {boolean} [data.notify=true] - Whether to send notification to subscribers
 * @returns {object} - Result of the operation
 */
async function handleDeviceControlWebhook(data) {
  // Extract parameters with defaults
  const { 
    entity_id, 
    domain, 
    service, 
    service_data = {},
    notify = true 
  } = data;
  
  // Validate required parameters
  if (!entity_id) {
    return { 
      success: false, 
      message: 'Missing required parameter: entity_id' 
    };
  }
  
  if (!domain) {
    return { 
      success: false, 
      message: 'Missing required parameter: domain' 
    };
  }
  
  if (!service) {
    return { 
      success: false, 
      message: 'Missing required parameter: service' 
    };
  }
  
  // Construct service call info
  const serviceCall = `${domain}.${service}`;
  console.log(`Device control - Calling service: ${serviceCall} with entity: ${entity_id}`);
  
  // Create friendly entity name for notifications
  const friendlyName = entity_id
    .split('.')[1]              // Get the entity name part
    .replace(/_/g, ' ')        // Replace underscores with spaces
    .replace(/\b\w/g, l => l.toUpperCase());  // Capitalize words
  
  // Determine action for notification
  let actionText = service.replace(/_/g, ' ');
  
  // Special handling for certain services
  if (service === 'turn_on') {
    actionText = 'turned on';
  } else if (service === 'turn_off') {
    actionText = 'turned off';
  }
  
  // Send notification if requested
  if (notify) {
    try {
      const emoji = determineEmoji(domain, service);
      const notificationMessage = `${emoji} ${friendlyName} ${actionText}`;
      
      await notifySubscribers('home', notificationMessage);
    } catch (error) {
      console.error('Error sending notification:', error);
      // Continue execution even if notification fails
    }
  }
  
  return { 
    success: true,
    service_call: serviceCall,
    entity: entity_id,
    service_data,
    message: `Called service: ${serviceCall} for entity: ${entity_id}` 
  };
}

/**
 * Determine appropriate emoji for the notification based on domain and service
 * @param {string} domain - The domain (light, switch, etc.)
 * @param {string} service - The service called
 * @returns {string} - An emoji representing the action
 */
function determineEmoji(domain, service) {
  // Default emoji
  let emoji = '🏠';
  
  // Based on domain
  switch (domain) {
    case 'light':
      emoji = service.includes('on') ? '💡' : '🌑';
      break;
    case 'switch':
      emoji = service.includes('on') ? '⚡' : '🔌';
      break;
    case 'media_player':
      if (service.includes('play')) emoji = '▶️';
      else if (service.includes('pause')) emoji = '⏸️';
      else if (service.includes('stop')) emoji = '⏹️';
      else emoji = '🎵';
      break;
    case 'climate':
      emoji = '❄️';
      break;
    case 'lock':
      emoji = service.includes('unlock') ? '🔓' : '🔒';
      break;
    case 'cover':
      if (service.includes('open')) emoji = '📂';
      else if (service.includes('close')) emoji = '📁';
      else emoji = '🪟';
      break;
  }
  
  return emoji;
}

module.exports = {
  register: (webhookHandler) => {
    // External ID will be automatically read from DEVICE_CONTROL_WEBHOOK_ID env var if available
    const externalId = process.env.DEVICE_CONTROL_WEBHOOK_ID || null;
    webhookHandler.register(
      'device_control', 
      handleDeviceControlWebhook, 
      'Controls individual Home Assistant devices using domain and service calls',
      externalId
    );
  }
};
