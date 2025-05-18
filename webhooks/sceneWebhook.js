/**
 * Scene Activation Webhook for Home Assistant
 * Activates scenes by name or ID and sends optional notifications
 * 
 * @module webhooks/sceneWebhook
 */
const { notifySubscribers, logHomeAssistantActivity } = require('./webhookUtils');
const { validateRequiredParams, validateAllowedValues } = require('./validationUtils');

// Valid notification channels
const VALID_CHANNELS = ['home', 'security', 'alerts', 'status', 'automation'];

/**
 * Handle scene activation webhook
 * This webhook activates Home Assistant scenes and sends notifications
 * 
 * @async
 * @param {Object} data - Webhook data from Home Assistant
 * @param {string} data.scene - The scene entity_id to activate (e.g., scene.movie_night)
 * @param {boolean} [data.notify=true] - Whether to send notification to subscribers
 * @param {string} [data.channel='home'] - The notification channel to use
 * @returns {Object} - Result of the operation with success status and message
 * @throws {Error} - On notification error
 */
async function handleSceneWebhook(data) {
  const { 
    scene, 
    notify = true,
    channel = 'home'
  } = data;
  
  // Validate required parameters
  const validationError = validateRequiredParams(data, ['scene']);
  if (validationError) {
    console.error(`Scene webhook validation error: ${validationError}`);
    return { 
      success: false, 
      message: validationError 
    };
  }
  
  // Validate channel if provided explicitly in the request
  if (data.channel) {
    const channelError = validateAllowedValues(channel, VALID_CHANNELS, 'channel');
    if (channelError) {
      console.error(`Scene webhook validation error: ${channelError}`);
      return {
        success: false,
        message: channelError
      };
    }
  }
  
  // Add scene. prefix if not present
  const sceneId = scene.startsWith('scene.') ? scene : `scene.${scene}`;
  console.log(`Scene webhook - Activating scene: ${sceneId}`);
  
  // Log activity for status tracking
  await logHomeAssistantActivity(`scene activation: ${sceneId}`);
  
  // Create friendly scene name for notifications
  const friendlyName = formatSceneName(sceneId);
  
  // Send notification if requested
  if (notify) {
    try {
      await notifySubscribers(
        channel, 
        `🎬 Scene activated: ${friendlyName}`
      );
    } catch (error) {
      console.error('Error sending notification:', error);
      // Continue execution even if notification fails
    }
  }
  
  return { 
    success: true,
    scene: sceneId,
    message: `Activated scene: ${sceneId}`,
    friendlyName: friendlyName
  };
}

/**
 * Format a scene ID into a human-readable name
 * 
 * @param {string} sceneId - The scene entity_id
 * @returns {string} - Formatted scene name
 */
function formatSceneName(sceneId) {
  return sceneId
    .replace('scene.', '')     // Remove the scene. prefix
    .replace(/_/g, ' ')        // Replace underscores with spaces
    .replace(/\b\w/g, l => l.toUpperCase());  // Capitalize words
}

/**
 * Register the scene webhook with webhook handler
 * 
 * @param {Object} webhookHandler - The webhook handler instance
 */
function register(webhookHandler) {
  // External ID will be automatically read from SCENE_WEBHOOK_ID env var if available
  const externalId = process.env.SCENE_WEBHOOK_ID || null;
  webhookHandler.register(
    'scene', 
    handleSceneWebhook, 
    'Activates Home Assistant scenes by name or ID',
    externalId
  );
}

module.exports = { register };
