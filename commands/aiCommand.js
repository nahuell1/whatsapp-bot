/**
 * AI Command for WhatsApp Bot
 * Handles integration with multiple AI providers (Ollama, OpenAI)
 */
const { safeApiRequest } = require('./utils');

// Configuration from environment variables
const CONFIG = {
  // API URLs and Authentication
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || '',
  
  // Default provider and model (used if specific ones not set)
  DEFAULT_AI_PROVIDER: process.env.DEFAULT_AI_PROVIDER || 'ollama', 
  DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Function model (for !ia command) - fall back to defaults
  FUNCTION_AI_PROVIDER: process.env.FUNCTION_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  FUNCTION_AI_MODEL: process.env.FUNCTION_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
};

/**
 * Handle AI command requests
 * @param {object} msg - WhatsApp message object
 * @param {string} prompt - User's prompt text
 */
async function handleAICommand(msg, prompt) {
  if (!prompt) {
    msg.reply('Por favor, enviá un mensaje después del comando !ia');
    return;
  }
  
  console.log('Processing AI prompt:', prompt);
  
  // For consistency, use the chatbot handler
  // This ensures we're using the same AI processing logic everywhere
  const chatbotHandler = require('./chatbotCommand');
  await chatbotHandler.handleChatbotMessage(msg, prompt);
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!ia', handleAICommand, 'Get an AI response to your message');
  }
};
