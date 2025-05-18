/**
 * @module commands/aiCommand
 * @description AI command implementation for the WhatsApp bot
 * 
 * This module provides the !ia command that allows users to interact
 * directly with AI models. It supports multiple providers including
 * Ollama and OpenAI, with configurable model selection.
 * 
 * @requires ./utils
 * @requires ./chatbotCommand
 */
const { safeApiRequest } = require('./utils');

/**
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  /**
   * API URLs and Authentication
   */
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || '',
  
  /**
   * Default provider and model (used if specific ones not set)
   */
  DEFAULT_AI_PROVIDER: process.env.DEFAULT_AI_PROVIDER || 'ollama', 
  DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  /**
   * Function model (for !ia command) - fall back to defaults
   */
  FUNCTION_AI_PROVIDER: process.env.FUNCTION_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  FUNCTION_AI_MODEL: process.env.FUNCTION_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
};

/**
 * Handle AI command requests by processing user's prompt
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} prompt - User's prompt text
 * @returns {Promise<void>}
 */
async function handleAICommand(msg, prompt) {
  try {
    // Validate that there's a prompt to process
    if (!prompt || prompt.trim() === '') {
      await msg.reply('Por favor, enviá un mensaje después del comando !ia');
      return;
    }
    
    console.log('Processing AI prompt:', prompt);
    
    // For consistency, use the chatbot handler
    // This ensures we're using the same AI processing logic everywhere
    const chatbotHandler = require('./chatbotCommand');
    
    // Delegate to the chatbot handler which contains all the AI logic
    await chatbotHandler.handleChatbotMessage(msg, prompt);
  } catch (error) {
    console.error('Error in AI command:', error);
    await msg.reply(`Error al procesar solicitud de IA: ${error.message}`);
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
    commandHandler.register('!ia', handleAICommand, 'Obtener una respuesta de la IA a tu mensaje');
  }
};
