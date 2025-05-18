/**
 * Area Control Webhook for Home Assistant
 * Controls areas via webhook with scene selection
 * 
 * @module webhooks/areaControlWebhook
 */
const { notifySubscribers, logHomeAssistantActivity, callHomeAssistantWebhook } = require('./webhookUtils');
const { validateAllowedValues } = require('./validationUtils');
const webhookHandler = require('./webhookHandler');

// Valid parameter options
const VALID_AREAS = ['office', 'room'];
const VALID_STATES = ['on', 'off'];

/**
 * Handle area control webhook
 * This webhook controls areas by turning on a scene with the format: scene.<area>_<state>
 * 
 * @async
 * @param {Object} data - Webhook data from Home Assistant
 * @param {string} data.area - The area to control (office, room)
 * @param {string} data.turn - The state to set (on, off)
 * @returns {Object} - Result of the operation
 */
async function handleAreaControlWebhook(data) {
  const { area = 'none', turn = 'off' } = data;
  
  // Validate parameters
  const areaValidationError = validateAllowedValues(area, VALID_AREAS, 'area');
  if (areaValidationError) {
    console.log(areaValidationError);
    return { 
      success: false, 
      message: areaValidationError
    };
  }
  
  const stateValidationError = validateAllowedValues(turn, VALID_STATES, 'turn');
  if (stateValidationError) {
    console.log(stateValidationError);
    return { 
      success: false, 
      message: stateValidationError 
    };
  }
  
  // Construct scene name: scene.{area}_{on/off}
  const sceneName = `scene.${area}_${turn}`;
  console.log(`Area control - Activating scene: ${sceneName}`);
  
  // Get the webhook external ID from registry
  const webhookInfo = webhookHandler.findWebhook('area_control');
  if (!webhookInfo) {
    return {
      success: false,
      message: 'Area control webhook not found in registry'
    };
  }
  
  // Call Home Assistant webhook with the external ID
  try {
    // Send webhook data to Home Assistant
    await callHomeAssistantWebhook(webhookInfo.externalId, {
      area,
      turn
    });
  } catch (error) {
    console.error('Error calling Home Assistant webhook:', error);
    return {
      success: false,
      message: `Failed to call Home Assistant: ${error.message}`
    };
  }
  
  // Construct notification message with appropriate emojis
  const areaName = area.charAt(0).toUpperCase() + area.slice(1);
  const emoji = turn === 'on' ? '💡' : '🌑';
  const actionText = turn === 'on' ? 'encendido' : 'apagado';
  const notificationMsg = `🏠 ${emoji} ${areaName} ${actionText}`;
  
  // Notify subscribers of the home channel
  try {
    await notifySubscribers('home', notificationMsg);
  } catch (error) {
    console.error('Error sending notification:', error);
    // Continue execution even if notification fails
  }
  
  // Log activity for status check
  await logHomeAssistantActivity(`area control: ${area} ${turn}`);
  
  // Return success response
  return { 
    success: true, 
    scene: sceneName, 
    message: `Activated scene: ${sceneName}` 
  };
}

/**
 * Register this webhook with the webhook handler
 * 
 * @param {Object} webhookHandler - The webhook handler instance
 */
function register(webhookHandler) {
  // External ID will be automatically read from AREA_CONTROL_WEBHOOK_ID env var if available
  const externalId = process.env.AREA_CONTROL_WEBHOOK_ID || null;
  
  webhookHandler.register(
    'area_control', 
    handleAreaControlWebhook, 
    'Controls areas by activating scenes based on area name and state',
    externalId
  );
}

module.exports = {
  register
};
