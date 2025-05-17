/**
 * Template Webhook for Home Assistant
 * Use this as a starting point for creating new webhooks
 */
const { validateRequiredParams, validateAllowedValues, validateType, isTruthy } = require('./validationUtils');

/**
 * Handle template webhook
 * @param {object} data - Webhook data from Home Assistant
 * @returns {object} - Result of the operation
 */
async function handleTemplateWebhook(data) {
  // Log the incoming data
  console.log('Template webhook received data:', data);
  
  // Example: Validate required parameters
  const validationError = validateRequiredParams(data, ['param1']);
  if (validationError) {
    return { 
      success: false, 
      message: validationError
    };
  }
  
  // Example: Extract parameters
  const { param1, param2 } = data;
  
  // Example: Validate parameter types or allowed values
  const typeError = validateType(param1, 'string', 'param1');
  if (typeError) {
    return {
      success: false,
      message: typeError
    };
  }
  
  // Example: Do something with the data
  const result = `Processed: ${param1} and ${param2 || 'N/A'}`;
  
  // Return a result
  return { 
    success: true, 
    message: 'Template webhook processed successfully',
    result
  };
}

// This is commented out because this is just a template
// Uncomment and modify to create an actual webhook handler
/*
module.exports = {
  register: (webhookHandler) => {
    // Opcionalmente, busca un ID externo en las variables de entorno
    const externalId = process.env.TEMPLATE_WEBHOOK_ID_WEBHOOK_ID || null;
    
    webhookHandler.register(
      'template_webhook_id', 
      handleTemplateWebhook, 
      'Description of what this webhook does',
      externalId  // ID externo (opcional)
    );
  }
};
*/

// To use this template:
// 1. Copy this file with a new name (e.g., myWebhook.js)
// 2. Modify the function to implement your webhook logic
// 3. Uncomment and update the module.exports block
// 4. Restart the bot
