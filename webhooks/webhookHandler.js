/**
 * Webhook Handler for Home Assistant Integration
 * Manages webhook registrations and their corresponding handlers
 * 
 * @module webhooks/webhookHandler
 */

/**
 * WebhookHandler class for managing webhook registrations and execution
 */
class WebhookHandler {
  /**
   * Create a webhook handler instance
   */
  constructor() {
    /** @type {Map<string, Object>} Map of internal names to webhook handlers and metadata */
    this.webhooks = new Map();
    
    /** @type {Map<string, string>} Map of external IDs to internal names */
    this.webhooksByExternalId = new Map();
    
    console.log('WebhookHandler initialized');
  }
  
  /**
   * Get all registered webhook internal names
   * 
   * @returns {string[]} Array of webhook internal names
   */
  getWebhookIds() {
    return Array.from(this.webhooks.keys());
  }

  /**
   * Register a new webhook
   * 
   * @param {string} name - Internal name for the webhook (used in code)
   * @param {Function} handler - Function that processes the webhook data
   * @param {string} description - Description of what this webhook does
   * @param {string} [externalId] - External ID used in URLs (e.g. Home Assistant webhook ID)
   * @throws {Error} If handler is not a function
   */
  register(name, handler, description, externalId = null) {
    // Validate parameters
    if (!name || typeof name !== 'string') {
      throw new TypeError('Webhook name must be a non-empty string');
    }
    
    if (!handler || typeof handler !== 'function') {
      throw new TypeError('Webhook handler must be a function');
    }
    
    if (!description || typeof description !== 'string') {
      throw new TypeError('Webhook description must be a non-empty string');
    }
    
    if (this.webhooks.has(name)) {
      console.warn(`Webhook with name '${name}' is already registered. Overwriting...`);
    }
    
    // Determine the external ID if not provided
    const effectiveExternalId = externalId || this.getExternalIdFromEnv(name) || name;
    
    // Register the webhook with its metadata
    this.webhooks.set(name, {
      handler,
      description,
      externalId: effectiveExternalId,
      registeredAt: new Date().toISOString()
    });
    
    // Map the external ID to the internal name for lookups
    this.webhooksByExternalId.set(effectiveExternalId, name);
    
    console.log(`Registered webhook handler for: ${name} (external ID: ${effectiveExternalId})`);
  }
  
  /**
   * Get the external ID from environment variable, if available
   * 
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
   * 
   * @returns {string[]} - Array of webhook internal names
   */
  getWebhookNames() {
    return Array.from(this.webhooks.keys());
  }
  
  /**
   * Get all registered webhook external IDs
   * 
   * @returns {string[]} - Array of webhook external IDs
   */
  getWebhookExternalIds() {
    return Array.from(this.webhooksByExternalId.keys());
  }

  /**
   * Get information about all registered webhooks
   * 
   * @returns {Object[]} - Array of webhook info objects
   */
  getWebhooksInfo() {
    return Array.from(this.webhooks.entries()).map(([name, info]) => ({
      name,
      externalId: info.externalId,
      description: info.description,
      registeredAt: info.registeredAt
    }));
  }
  
  /**
   * Find webhook by name or external ID
   * 
   * @param {string} idOrName - Webhook ID or name
   * @returns {Object|null} - Webhook info or null if not found
   */
  findWebhook(idOrName) {
    if (!idOrName || typeof idOrName !== 'string') {
      return null;
    }
    
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
   * Handle an incoming webhook request
   * 
   * @param {string} idOrName - Internal name or external ID of webhook
   * @param {Object} data - Data received from the webhook
   * @returns {Promise<Object>} - Promise resolving to the result of the handler
   * @throws {Error} If webhook is not found or handler encounters an error
   */
  async handleWebhook(idOrName, data) {
    // Find webhook by name or external ID
    const webhookInfo = this.findWebhook(idOrName);
    
    if (!webhookInfo) {
      console.error(`No webhook handler found for: ${idOrName}`);
      return {
        success: false,
        error: 'Webhook not found',
        message: `No handler registered for webhook: ${idOrName}`
      };
    }
    
    try {
      console.log(`Processing webhook: ${webhookInfo.name} (external ID: ${webhookInfo.externalId})`);
      const startTime = Date.now();
      const result = await webhookInfo.handler(data);
      const executionTime = Date.now() - startTime;
      
      console.log(`Webhook ${webhookInfo.name} processed in ${executionTime}ms`);
      
      return {
        success: true,
        webhook: webhookInfo.name,
        result,
        _meta: {
          webhookName: webhookInfo.name,
          executionTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`Error processing webhook ${webhookInfo.name}:`, error);
      return {
        success: false,
        error: `Webhook handler error: ${error.message || 'Unknown error'}`,
        webhook: webhookInfo.name,
        message: `Error processing webhook ${webhookInfo.name}`,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }
}

// Create and export an instance of the WebhookHandler class
const webhookHandlerInstance = new WebhookHandler();
module.exports = webhookHandlerInstance;
