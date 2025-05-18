/**
 * Chatbot Command for WhatsApp Bot
 * Handles natural language processing and function calls
 * 
 * This module implements an intelligent chatbot that can:
 * 1. Process natural language messages that don't begin with a command prefix (!)
 * 2. Automatically detect when the user wants to execute a command or webhook
 * 3. Extract the relevant function call and execute it
 * 
 * The chatbot works by:
 * - Sending the user's message to the language model with a system prompt
 * - The system prompt contains all available commands and webhooks
 * - When appropriate, the model generates a special function call syntax
 * - This module parses the function call and executes the corresponding action
 * 
 * Function call formats:
 * - For commands: __execute_command("!command", "arguments")
 * - For webhooks: __execute_webhook("webhook_id", {"param": "value"})
 * 
 * Configuration:
 * - Set ENABLE_FUNCTION_CALLS=false in .env to disable automatic command execution
 */
const { safeApiRequest } = require('./utils');

// Import the command & webhook handlers to access available functions
const commandHandler = require('./commandHandler');
const webhookHandler = require('../webhooks/webhookHandler');

// Conditionally import OpenAI
let OpenAI;
try {
  OpenAI = require('openai');
} catch (error) {
  console.warn('OpenAI package not available:', error.message);
}

// Configuration
const CONFIG = {
  // Ollama configuration
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mi-bot',
  
  // OpenAI configuration
  AI_PROVIDER: process.env.AI_PROVIDER || 'ollama', // 'ollama' or 'openai'
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || ''
};

// Function to check if function calls are enabled
function areFunctionCallsEnabled() {
  try {
    // First try to get the setting from the settings module
    const settingsCommand = require('./settingsCommand');
    if (settingsCommand && settingsCommand.getSettings) {
      return settingsCommand.getSettings().enableFunctionCalls;
    }
  } catch (error) {
    // Ignore errors, fall back to environment variable
  }
  
  // Fall back to environment variable
  return process.env.ENABLE_FUNCTION_CALLS !== 'false';
}

// Store client reference for executing functions
let whatsappClient = null;

/**
 * Extract command and args from a potential function call in AI response
 * @param {string} functionCall - The function call text
 * @returns {object|null} - Command info or null if not a valid function call
 */
function parseFunctionCall(functionCall) {
  try {
    // Check if the functionCall contains a valid function call format
    // We're looking for patterns like: __execute_command("!command", "args")
    const match = functionCall.match(/__execute_command\(['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?\)/);
    
    if (match) {
      return {
        command: match[1],
        args: match[2] || ''
      };
    }
    
    // Check for webhook execution pattern: __execute_webhook("webhook_id", {data})
    const webhookMatch = functionCall.match(/__execute_webhook\(['"]([^'"]+)['"](?:,\s*({.+?}))?\)/s);
    if (webhookMatch) {
      try {
        const webhookId = webhookMatch[1];
        const webhookDataStr = webhookMatch[2] || '{}';
        
        // Replace single quotes with double quotes for proper JSON parsing
        const jsonStr = webhookDataStr
          .replace(/'/g, '"')
          // Handle special case for JSON property names without quotes
          .replace(/(\w+):/g, '"$1":');
        
        const webhookData = JSON.parse(jsonStr);
        
        return {
          webhook: webhookId,
          data: webhookData
        };
      } catch (parseError) {
        console.error('Error parsing webhook data:', parseError);
        console.error('Raw webhook data string:', webhookMatch[2]);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing function call:', error);
    return null;
  }
}

/**
 * Generate an Ollama system prompt with available commands and webhooks
 * @returns {string} - System prompt with available commands and webhooks
 */
function generateSystemPrompt() {
  // Get all available commands
  const availableCommands = Array.from(commandHandler.commands.keys())
    .map(cmd => {
      const helpIndex = commandHandler.helpMessages.findIndex(help => help.startsWith(cmd));
      const helpText = helpIndex >= 0 ? commandHandler.helpMessages[helpIndex] : cmd;
      return helpText;
    });
  
  // Get all available webhooks
  const availableWebhooks = webhookHandler.getWebhooksInfo()
    .map(webhook => `${webhook.name}: ${webhook.description}`);

  const systemPrompt = `
You are a smart WhatsApp assistant capable of answering questions and executing commands.
Respond concisely, clearly, and in a friendly, natural tone.

AVAILABLE COMMANDS:
${availableCommands.join('\n')}

AVAILABLE WEBHOOKS:
${availableWebhooks.join('\n')}

FUNCTION EXECUTION CAPABILITIES:
If the user requests an action that matches an available command or webhook,
you MUST use the corresponding function to execute it properly.

For commands: 
  __execute_command("!command", "arguments")
  - The first parameter must be the full command including the '!' symbol
  - The second parameter should be the arguments as a string

For webhooks: 
  __execute_webhook("webhook_name", {data})
  - The first parameter is the webhook internal name (e.g., "area_control", "send_notification")
  - The AI should use the internal name, and the system will automatically map it to the correct external ID
  - The second parameter is a JSON object with the required data

USAGE EXAMPLES:
1. If the user asks: "What's the weather like in Buenos Aires?"
   Your response: "I'll check the weather for you. __execute_command("!clima", "Buenos Aires")"

2. If the user says: "Turn off the office lights"
   Your response: "Turning off the office lights. __execute_webhook("area_control", {"area": "office", "turn": "off"})"

3. If the user says: "Send a message to Luis saying I'll be late"
   Your response: "Sending the notification. __execute_webhook("send_notification", {"to": "Luis", "message": "I'll be late"})"

DO NOT use these functions if the user isn't clearly requesting a related action.
If the user simply asks a general question that doesn't require executing a specific action, just reply normally.
When using a function, briefly explain what you're going to do before calling the function.

`;

  return systemPrompt;
}

/**
 * Log function calls made by the chatbot
 * @param {string} type - Type of function call (command or webhook)
 * @param {object} data - Data about the function call
 */
async function logFunctionCall(type, data) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const logFile = path.join(__dirname, '../logs/chatbot_functions.log');
    
    // Ensure the logs directory exists
    try {
      await fs.mkdir(path.join(__dirname, '../logs'), { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error('Error creating logs directory:', err);
      }
    }
    
    // Format log entry as JSON
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
    };
    
    // Append to log file
    await fs.appendFile(
      logFile,
      JSON.stringify(logEntry) + '\n',
      'utf8'
    );
  } catch (err) {
    console.error('Error logging function call:', err);
  }
}

/**
 * Handle chatbot messages and process potential function calls
 * @param {object} msg - WhatsApp message object
 * @param {string} text - User's message text
 */
async function handleChatbotMessage(msg, text) {
  console.log('Processing chatbot message:', text);
  
  try {
    // Get the system prompt with available commands and webhooks
    const systemPrompt = generateSystemPrompt();
    
    let aiResponse;
    let nativeFunctionCall = null;
    
    // Choose which AI provider to use
    if (CONFIG.AI_PROVIDER.toLowerCase() === 'openai' && OpenAI && CONFIG.OPENAI_API_KEY) {
      console.log('Using OpenAI API for chat response');
      
      try {
        // Initialize OpenAI client
        const openaiOptions = {
          apiKey: CONFIG.OPENAI_API_KEY,
        };
        
        if (CONFIG.OPENAI_ORG_ID) {
          openaiOptions.organization = CONFIG.OPENAI_ORG_ID;
        }
        
        const openai = new OpenAI(openaiOptions);
        
        // Define available functions for OpenAI
        const functions = [
          {
            name: "execute_command",
            description: "Execute a WhatsApp bot command",
            parameters: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The command to execute, including the ! prefix",
                },
                args: {
                  type: "string",
                  description: "The arguments to pass to the command",
                },
              },
              required: ["command"],
            },
          },
          {
            name: "execute_webhook",
            description: "Execute a webhook to control Home Assistant",
            parameters: {
              type: "object",
              properties: {
                webhook: {
                  type: "string",
                  description: "The webhook name to execute (internal name, e.g. area_control)",
                },
                data: {
                  type: "object",
                  description: "The data to send to the webhook",
                },
              },
              required: ["webhook", "data"],
            },
          },
        ];
        
        // Call OpenAI API with function calling
        const completion = await openai.chat.completions.create({
          model: CONFIG.OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          tools: functions.map(func => ({ type: "function", function: func })),
          temperature: 0.7,
          max_tokens: 800,
        });
        
        const responseMessage = completion.choices[0]?.message;
        
        // Check if the model wants to call a function
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          const toolCall = responseMessage.tool_calls[0];
          
          if (toolCall.function) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            
            console.log(`OpenAI requested function call: ${functionName}`, functionArgs);
            
            // Convert to our internal function call format
            if (functionName === 'execute_command') {
              nativeFunctionCall = {
                command: functionArgs.command,
                args: functionArgs.args || '',
              };
            } else if (functionName === 'execute_webhook') {
              nativeFunctionCall = {
                webhook: functionArgs.webhook,
                data: functionArgs.data || {},
              };
            }
            
            // Get the response text without function call
            aiResponse = responseMessage.content || '';
          } else {
            aiResponse = responseMessage.content || 'No recibí respuesta clara del modelo de IA.';
          }
        } else {
          aiResponse = responseMessage.content || 'No recibí respuesta clara del modelo de IA.';
        }
      } catch (openaiError) {
        console.error('Error using OpenAI API:', openaiError);
        // Fall back to Ollama if OpenAI fails
        aiResponse = await getOllamaResponse(systemPrompt, text);
      }
    } else {
      // Use Ollama API
      aiResponse = await getOllamaResponse(systemPrompt, text);
    }
    
    console.log('AI response received:', aiResponse.substring(0, 100) + '...');
    
    /**
     * Helper function to get response from Ollama
     * @param {string} systemPrompt - The system prompt
     * @param {string} userMessage - The user's message
     * @returns {Promise<string>} - The AI response
     */
    async function getOllamaResponse(systemPrompt, userMessage) {
      console.log('Using Ollama API for chat response');
      const data = await safeApiRequest(`${CONFIG.OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.OLLAMA_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          stream: false
        })
      }, 120000); // 120 second timeout
      
      return data.message?.content || data.response || 'No recibí respuesta clara del modelo de IA.';
    }
    
    // For OpenAI, we might already have a native function call
    let functionCall = nativeFunctionCall;
    let responseToUser = aiResponse;
    
    // For Ollama or text-based function calls, parse them from the response text
    if (!functionCall) {
      // Check if the response contains a text-based function call
      const functionCallRegex = /__execute_(?:command|webhook)\([^)]+\)/;
      const functionCallMatch = aiResponse.match(functionCallRegex);
      
      if (functionCallMatch) {
        functionCall = parseFunctionCall(functionCallMatch[0]);
        console.log('Detected function call:', functionCall);
        
        // Remove the function call from the response
        responseToUser = aiResponse.replace(functionCallRegex, '').trim();
        
        // Clean up any double spaces or newlines that might be left
        responseToUser = responseToUser
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
      }
    }
    
    // If function calls are disabled, inform the user
    if (!areFunctionCallsEnabled() && functionCall) {
      // Add a note about the disabled function
      let actionType = functionCall.command ? 'comando' : 'acción';
      let actionName = functionCall.command || functionCall.webhook || 'desconocida';
      
      responseToUser += `\n\n_La ejecución automática de ${actionType}s está desactivada. Usa !settings funciones on para activarla._`;
    }
    
    // Execute the command if found
    if (functionCall.command && commandHandler.commands.has(functionCall.command)) {
      const handler = commandHandler.commands.get(functionCall.command);
      console.log(`Executing command: ${functionCall.command} with args: ${functionCall.args}`);
      
      // Log the function call
      await logFunctionCall('command', {
        command: functionCall.command,
        args: functionCall.args,
        userMessage: text
      });
      
      // If we have a response to send before executing the command
      if (responseToUser) {
        await msg.reply(responseToUser);
      }
      
      // Execute the command
      await handler(msg, functionCall.args);
      return; // Command handler will send the response
    }
    
    // Execute the webhook if found
    if (functionCall.webhook) {
      console.log(`Executing webhook: ${functionCall.webhook} with data:`, functionCall.data);
      
      // Find the webhook by name or ID
      const webhookInfo = webhookHandler.findWebhook(functionCall.webhook);
      
      if (!webhookInfo) {
        await msg.reply(`❌ No encontré el webhook "${functionCall.webhook}". Por favor verifica el nombre.`);
        return;
      }
      
      // Log the function call
      await logFunctionCall('webhook', {
        webhook: webhookInfo.name,
        externalId: webhookInfo.externalId,
        data: functionCall.data,
        userMessage: text
      });
      
      // Log the webhook mapping for debugging
      console.log(`Webhook mapping: internal name [${webhookInfo.name}] -> external ID [${webhookInfo.externalId}]`);
      
      // If we have a response to send before executing the webhook
      if (responseToUser) {
        await msg.reply(responseToUser);
      }
      
      // Execute the webhook using the internal name (which the handler will find)
      const result = await webhookHandler.handleWebhook(webhookInfo.name, functionCall.data);
      
      if (result.error) {
        await msg.reply(`❌ No pude completar la acción: ${result.message}`);
      } else {
        // Format the result in a user-friendly way
        let successMessage = '✅ Acción completada con éxito';
        
        // Add specific details based on the webhook type
        if (functionCall.webhook === 'area_control') {
          const area = functionCall.data.area || 'área';
          const turn = functionCall.data.turn || 'estado';
          successMessage = `✅ He ${turn === 'on' ? 'encendido' : 'apagado'} las luces del ${area}`;
        } else if (functionCall.webhook === 'send_notification') {
          successMessage = `✅ Mensaje enviado correctamente`;
        } else if (result.message) {
          successMessage = `✅ ${result.message}`;
        }
        
        await msg.reply(successMessage);
      }
      return;
    }
    
    // If no function call was executed, just send the AI response
    await msg.reply(responseToUser);
    
  } catch (error) {
    console.error('Error processing chatbot message:', error);
    msg.reply('Lo siento, tuve un problema procesando tu mensaje. Por favor intenta de nuevo.');
  }
}

module.exports = {
  handleChatbotMessage,
  setClient: (client) => {
    whatsappClient = client;
  }
};
