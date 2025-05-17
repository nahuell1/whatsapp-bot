/**
 * Area Control Webhook for Home Assistant
 * Controls areas via webhook with scene selection
 */
const { notifySubscribers, logHomeAssistantActivity, callHomeAssistantWebhook } = require('./webhookUtils');
const webhookHandler = require('./webhookHandler');

/**
 * Handle area control webhook
 * This webhook controls areas by turning on a scene with the format: scene.<area>_<state>
 * 
 * @param {object} data - Webhook data from Home Assistant
 * @param {string} data.area - The area to control (office, room)
 * @param {string} data.turn - The state to set (on, off)
 * @returns {object} - Result of the operation
 */
async function handleAreaControlWebhook(data) {
  const { area = 'none', turn = 'off' } = data;
  
  // Validate parameters
  if (!['office', 'room'].includes(area)) {
    console.log(`Invalid area: ${area}`);
    return { 
      success: false, 
      message: `Area '${area}' not valid. Available areas: office, room` 
    };
  }
  
  if (!['on', 'off'].includes(turn)) {
    console.log(`Invalid state: ${turn}`);
    return { 
      success: false, 
      message: `State '${turn}' not valid. Available states: on, off` 
    };
  }
  
  // Construct scene name: scene.{area}_{on/off}
  const sceneName = `scene.${area}_${turn}`;
  console.log(`Area control - Activating scene: ${sceneName}`);
  
  // Get the webhook external ID
  const webhookInfo = webhookHandler.findWebhook('area_control');
  if (!webhookInfo) {
    return {
      success: false,
      message: 'Area control webhook not found in registry'
    };
  }
  
  // Call Home Assistant webhook with the external ID
  try {
    await callHomeAssistantWebhook(webhookInfo.externalId, {
      area: area,
      turn: turn
    });
  } catch (error) {
    console.error('Error calling Home Assistant webhook:', error);
    return {
      success: false,
      message: `Failed to call Home Assistant: ${error.message}`
    };
  }
  
  // Notify subscribers of the home channel
  try {
    await notifySubscribers(
      'home', 
      `🏠 ${turn === 'on' ? '💡' : '🌑'} ${area.charAt(0).toUpperCase() + area.slice(1)} ${turn === 'on' ? 'encendido' : 'apagado'}`
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    // Continue execution even if notification fails
  }
  
  // Log activity for status check
  await logHomeAssistantActivity(`area control: ${area} ${turn}`);
  
  return { 
    success: true, 
    scene: sceneName, 
    message: `Activated scene: ${sceneName}` 
  };
}

module.exports = {
  register: (webhookHandler) => {
    // External ID will be automatically read from AREA_CONTROL_WEBHOOK_ID env var if available
    const externalId = process.env.AREA_CONTROL_WEBHOOK_ID || null;
    webhookHandler.register(
      'area_control', 
      handleAreaControlWebhook, 
      'Controls areas by activating scenes based on area name and state',
      externalId
    );
  }
};
