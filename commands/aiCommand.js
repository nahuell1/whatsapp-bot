/**
 * AI Command for WhatsApp Bot
 * Handles integration with Ollama API
 */
const { safeApiRequest } = require('./utils');

// Configuration from environment variables
const CONFIG = {
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mi-bot'
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
  
  // For consistency, we'll just use the chatbot handler
  // This ensures we're using the same AI processing logic everywhere
  const chatbotHandler = require('./chatbotCommand');
  await chatbotHandler.handleChatbotMessage(msg, prompt);
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!ia', handleAICommand, 'Get an AI response to your message');
  }
};
