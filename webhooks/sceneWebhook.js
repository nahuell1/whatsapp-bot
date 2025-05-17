/**
 * Scene Activation Webhook for Home Assistant
 * Activates scenes by name or ID
 */
const { notifySubscribers } = require('./webhookUtils');

/**
 * Handle scene activation webhook
 * This webhook activates Home Assistant scenes
 * 
 * @param {object} data - Webhook data from Home Assistant
 * @param {string} data.scene - The scene entity_id to activate (e.g., scene.movie_night)
 * @param {boolean} [data.notify=true] - Whether to send notification to subscribers
 * @param {string} [data.channel='home'] - The notification channel to use
 * @returns {object} - Result of the operation
 */
async function handleSceneWebhook(data) {
  const { 
    scene, 
    notify = true,
    channel = 'home'
  } = data;
  
  // Validate scene parameter
  if (!scene) {
    return { 
      success: false, 
      message: 'Missing required parameter: scene' 
    };
  }
  
  // Add scene. prefix if not present
  const sceneId = scene.startsWith('scene.') ? scene : `scene.${scene}`;
  console.log(`Scene webhook - Activating scene: ${sceneId}`);
  
  // Create friendly scene name for notifications
  const friendlyName = sceneId
    .replace('scene.', '')     // Remove the scene. prefix
    .replace(/_/g, ' ')        // Replace underscores with spaces
    .replace(/\b\w/g, l => l.toUpperCase());  // Capitalize words
  
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
    message: `Activated scene: ${sceneId}` 
  };
}

module.exports = {
  register: (webhookHandler) => {
    // External ID will be automatically read from SCENE_WEBHOOK_ID env var if available
    const externalId = process.env.SCENE_WEBHOOK_ID || null;
    webhookHandler.register(
      'scene', 
      handleSceneWebhook, 
      'Activates Home Assistant scenes by name or ID',
      externalId
    );
  }
};
