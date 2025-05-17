/**
 * Webhook Handler for Home Assistant Integration
 * Manages webhook registrations and their corresponding handlers
 */

class WebhookHandler {
  constructor() {
    this.webhooks = new Map(); // Map of internal names to webhook handlers and metadata
    this.webhooksByExternalId = new Map(); // Map of external IDs to internal names
  }

  /**
   * Register a new webhook
   * @param {string} name - Internal name for the webhook (used in code)
   * @param {function} handler - Function that processes the webhook data
   * @param {string} description - Description of what this webhook does
   * @param {string} [externalId] - External ID used in URLs (e.g. Home Assistant webhook ID)
   */
  register(name, handler, description, externalId = null) {
    if (this.webhooks.has(name)) {
      console.warn(`Webhook with name '${name}' is already registered. Overwriting...`);
    }
    
    // Determine the external ID if not provided
    const effectiveExternalId = externalId || this.getExternalIdFromEnv(name) || name;
    
    // Register the webhook with its metadata
    this.webhooks.set(name, {
      handler,
      description,
      externalId: effectiveExternalId
    });
    
    // Map the external ID to the internal name for lookups
    this.webhooksByExternalId.set(effectiveExternalId, name);
    
    console.log(`Registered webhook handler for: ${name} (external ID: ${effectiveExternalId})`);
  }
  
  /**
   * Get the external ID from environment variable, if available
   * @param {string} name - Internal webhook name
   * @returns {string|null} - External ID from env var or null if not found
   */
  getExternalIdFromEnv(name) {
    // Convert internal name to env var format: area_control -> AREA_CONTROL_WEBHOOK_ID
    const envName = `${name.toUpperCase()}_WEBHOOK_ID`;
    const envValue = process.env[envName];
    
    if (envValue) {
      console.log(`Using external ID from environment variable ${envName}: ${envValue}`);
      return envValue;
    }
    
    return null;
  }

  /**
   * Get all registered webhook internal names
   * @returns {Array} - Array of webhook internal names
   */
  getWebhookNames() {
    return Array.from(this.webhooks.keys());
  }
  
  /**
   * Get all registered webhook external IDs
   * @returns {Array} - Array of webhook external IDs
   */
  getWebhookExternalIds() {
    return Array.from(this.webhooksByExternalId.keys());
  }

  /**
   * Get information about all registered webhooks
   * @returns {Array} - Array of webhook info objects
   */
  getWebhooksInfo() {
    return Array.from(this.webhooks.entries()).map(([name, info]) => ({
      name,
      externalId: info.externalId,
      description: info.description
    }));
  }
  
  /**
   * Find webhook by name or external ID
   * @param {string} idOrName - Webhook ID or name
   * @returns {object|null} - Webhook info or null if not found
   */
  findWebhook(idOrName) {
    // Try direct lookup by internal name
    if (this.webhooks.has(idOrName)) {
      const webhookInfo = this.webhooks.get(idOrName);
      return {
        name: idOrName,
        ...webhookInfo
      };
    }
    
    // Try lookup by external ID
    const name = this.webhooksByExternalId.get(idOrName);
    if (name) {
      const webhookInfo = this.webhooks.get(name);
      return {
        name,
        ...webhookInfo
      };
    }
    
    return null;
  }

  /**
   * Process an incoming webhook request
   * @param {string} idOrName - Webhook ID or name
   * @param {object} data - Webhook data
   * @returns {Promise<object>} - Response data or error
   */
  async handleWebhook(idOrName, data) {
    // Find webhook by name or external ID
    const webhookInfo = this.findWebhook(idOrName);
    
    if (!webhookInfo) {
      return {
        error: true,
        message: `Webhook identifier '${idOrName}' not registered`
      };
    }
    
    try {
      const result = await webhookInfo.handler(data);
      return {
        success: true,
        webhook: webhookInfo.name,
        result
      };
    } catch (error) {
      console.error(`Error processing webhook ${webhookInfo.name}:`, error);
      return {
        error: true,
        webhook: webhookInfo.name,
        message: error.message
      };
    }
  }
}

module.exports = new WebhookHandler();
