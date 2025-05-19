/**
 * @module commands/openaiUsageCommand
 * @description Command to check OpenAI API usage and limits
 * 
 * This module provides the !openai command that fetches and displays
 * current usage data from the OpenAI API, including costs and quotas.
 * 
 * @requires whatsapp-web.js
 * @requires ./utils
 */

const { formatMessage } = require('./utils');
const fetch = require('node-fetch');

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID;

/**
 * Format currency amounts
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (e.g., 'usd')
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'usd') {
  if (typeof amount !== 'number') return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Format date string to local format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Fetch OpenAI usage data
 * @returns {Promise<Object>} Usage data or error object
 */
async function fetchOpenAIUsage() {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };
  
  if (OPENAI_ORG_ID) {
    headers['OpenAI-Organization'] = OPENAI_ORG_ID;
  }
  
  try {
    // Check API key validity and get models as a test
    const modelsResponse = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers
    });
    
    if (!modelsResponse.ok) {
      throw new Error(`API key validation failed: ${modelsResponse.status}: ${await modelsResponse.text()}`);
    }
    
    // Note: The billing endpoints are not accessible with API key authentication
    // These endpoints require browser session authentication
    // We'll provide model access information instead
    
    const models = await modelsResponse.json();
    
    // Get current date for informational purposes
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    // Return available models as a proxy for API access status
    return {
      apiKeyValid: true,
      date: formattedDate,
      modelsAvailable: models.data?.length || 0,
      models: models.data?.slice(0, 5).map(model => model.id) || []
    };
  } catch (error) {
    console.error('Error fetching OpenAI usage:', error);
    throw error;
  }
}

/**
 * Handle openai command requests
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} args - Command arguments (unused)
 * @returns {Promise<void>}
 */
async function handleOpenAIUsageCommand(msg, args) {
  try {
    // Send a processing message
    await msg.reply(formatMessage({
      title: '⏳ Consultando datos de OpenAI...',
      body: 'Verificando acceso a la API de OpenAI...'
    }));
    
    // Fetch available data (API status and models)
    const data = await fetchOpenAIUsage();
    
    // Create a detailed message
    const title = '🔑 Estado de la API de OpenAI';
    
    let body = '';
    
    // API Key status
    body += `*Estado de la API:* ${data.apiKeyValid ? '✅ Activo' : '❌ Inactivo'}\n`;
    body += `*Fecha de verificación:* ${new Date(data.date).toLocaleDateString()}\n\n`;
    
    // Models information
    if (data.modelsAvailable > 0) {
      body += `*Acceso a modelos:* ${data.modelsAvailable} modelos disponibles\n\n`;
      
      // Show a few sample models
      body += '*Modelos destacados:*\n';
      for (const modelId of data.models) {
        body += `- ${modelId}\n`;
      }
      
      body += `\n*Nota:* La información detallada de facturación solo está disponible a través del panel de OpenAI.`;
    }
    
    // Add footer
    let footer = 'Para ver detalles de facturación y uso, visita: https://platform.openai.com/account/usage';
    
    // Send the formatted message
    await msg.reply(formatMessage({
      title,
      body,
      footer
    }));
    
  } catch (error) {
    console.error('OpenAI usage command error:', error);
    
    // Send error message
    await msg.reply(formatMessage({
      title: '❌ Error',
      body: `No se pudo obtener la información de uso: ${error.message}`,
      footer: 'Verifica tu configuración de API y vuelve a intentarlo.'
    }));
  }
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Register this command with the command handler
   * 
   * @param {Object} commandHandler - Command handler instance
   */
  register: (commandHandler) => {
    commandHandler.register(
      '!openai', 
      handleOpenAIUsageCommand, 
      'Muestra información sobre el uso y límites de la API de OpenAI: !openai'
    );
  }
};
