/**
 * @module commands/chatbotCommand
 * @description Intelligent chatbot with natural language processing and function call capabilities
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
 * @requires ./utils
 * @requires ./commandHandler
 * @requires ../webhooks/webhookHandler
 * @requires ./parameterExtraction
 */
const { safeApiRequest } = require('./utils');

// Import the command & webhook handlers to access available functions
const commandHandler = require('./commandHandler');
const webhookHandler = require('../webhooks/webhookHandler');
const parameterExtraction = require('./parameterExtraction');

/**
 * OpenAI client - conditionally imported
 * @type {Object|null}
 */
let OpenAI;
try {
  OpenAI = require('openai');
} catch (error) {
  console.warn('OpenAI package not available:', error.message);
}

/**
 * Configuration settings for AI providers and models
 * Supports multiple models for different purposes with fallback chains
 * 
 * @type {Object}
 * @constant
 */
const CONFIG = {
  // API URLs and Authentication
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || '',
  
  // Default provider and model (used if specific ones not set)
  DEFAULT_AI_PROVIDER: process.env.DEFAULT_AI_PROVIDER || 'ollama', // 'ollama' or 'openai'
  DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Intent detection model (small model to classify intent)
  INTENT_AI_PROVIDER: process.env.INTENT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  INTENT_AI_MODEL: process.env.INTENT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Chat model (for regular conversations)
  CHAT_AI_PROVIDER: process.env.CHAT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  CHAT_AI_MODEL: process.env.CHAT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Function model (for executing commands and webhooks)
  FUNCTION_AI_PROVIDER: process.env.FUNCTION_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  FUNCTION_AI_MODEL: process.env.FUNCTION_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
};

/**
 * Checks if function calls are enabled via settings or environment variables
 * 
 * @returns {boolean} True if function calls are enabled, false otherwise
 */
function areFunctionCallsEnabled() {
  try {
    // First try to get the setting from the settings module
    const settingsCommand = require('./settingsCommand');
    if (settingsCommand && settingsCommand.getSettings) {
      const settings = settingsCommand.getSettings();
      return settings && settings.enableFunctionCalls === true;
    }
  } catch (error) {
    // Ignore errors, fall back to environment variable
    console.debug('Error retrieving function call settings:', error.message);
  }
  
  // Fall back to environment variable (default to enabled unless explicitly disabled)
  return process.env.ENABLE_FUNCTION_CALLS !== 'false';
}

/**
 * WhatsApp client reference for executing functions
 * @type {Object|null}
 */
let whatsappClient = null;

/**
 * Get list of available webhook names from the webhook handler
 * 
 * @returns {string[]} Array of internal webhook names
 */
function getAvailableWebhookNames() {
  try {
    return webhookHandler.getWebhooksInfo().map(webhook => webhook.name);
  } catch (error) {
    console.error('Error retrieving webhook names:', error);
    return [];
  }
}

/**
 * Get webhook parameter schema for OpenAI function definition
 * 
 * @param {string} webhookName - Name of the webhook
 * @returns {object} Schema for function parameters
 * @throws {Error} If webhook parameters cannot be retrieved
 */
function getWebhookParametersSchema(webhookName) {
  if (!webhookName) {
    throw new Error('Webhook name is required to get parameter schema');
  }
  
  // Get parameter info for this webhook
  const paramInfo = parameterExtraction.getWebhookParameterInfo(webhookName);
  const paramDefs = parameterExtraction.getParameterDefinitions(webhookName);
  
  // Create properties object for each parameter
  const properties = {};
  
  // For each parameter defined for this webhook
  if (paramDefs && paramDefs.parameters) {
    for (const [paramName, paramDef] of Object.entries(paramDefs.parameters)) {
      properties[paramName] = {
        type: "string",
        description: paramDef.description || `Parameter ${paramName} for ${webhookName}`,
      };
      
      // Add enum if we have valid values
      if (paramDef.validValues && Array.isArray(paramDef.validValues) && paramDef.validValues.length > 0) {
        properties[paramName].enum = paramDef.validValues;
      }
    }
  }
  
  const schema = {
    type: "object",
    description: `Data for ${webhookName} webhook`,
    properties: properties,
    required: Array.isArray(paramInfo.required) ? paramInfo.required : []
  };
  
  return schema;
}

/**
 * Generate OpenAI function definitions for all webhooks
 * 
 * @returns {Array<Object>} Array of function definitions compatible with OpenAI API
 * @throws {Error} If webhook definitions cannot be generated
 */
function generateWebhookFunctionDefinitions() {
  try {
    // Get all webhook names
    const webhookNames = getAvailableWebhookNames();
    
    // Create a function definition for each webhook
    return webhookNames.map(webhookName => {
      const webhookInfo = webhookHandler.findWebhook(webhookName);
      if (!webhookInfo) return null;
      
      const description = webhookInfo.description || `Execute the ${webhookName} webhook to control Home Assistant`;
      
      return {
        name: "execute_webhook",
        description: description,
        parameters: {
          type: "object",
          properties: {
            webhook: {
              type: "string",
              description: "The webhook name to execute (internal name)",
              enum: [webhookName]
            },
            data: getWebhookParametersSchema(webhookName)
          },
          required: ["webhook", "data"],
        },
      };
    }).filter(Boolean); // Filter out any null entries
  } catch (error) {
    console.error('Error generating webhook function definitions:', error);
    return [];
  }
}

/**
 * Extract command and args from a potential function call in AI response
 * 
 * @param {string} functionCall - The function call text to parse
 * @returns {object|null} Command info object or null if not a valid function call
 * @property {string} type - Type of call ('command' or 'webhook')
 * @property {string} command - Command name or webhook name
 * @property {string|object} args - Arguments for the command or webhook
 */
function parseFunctionCall(functionCall) {
  if (!functionCall || typeof functionCall !== 'string') {
    return null;
  }
  
  try {
    return parseFunctionCallText(functionCall);
  } catch (error) {
    console.error('Error parsing function call:', error);
    return null;
  }
}

/**
 * Extract parameter specifications from command files
 * 
 * Uses multiple strategies to find parameter documentation in command files:
 * 1. JSDoc annotations for the args parameter
 * 2. Command registration help text
 * 3. Variable declarations and comments in handler functions
 * 4. Parameter validation checks
 * 5. Special case handling for known commands
 * 
 * @param {string} commandName - Name of the command (e.g., "!clima")
 * @returns {string} Parameter specifications or empty string if not found
 * @throws {Error} Silently caught if file access or parsing fails
 */
function extractCommandParameters(commandName) {
  if (!commandName) {
    return '';
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Remove the ! prefix and convert to camelCase if needed
    const baseCommandName = commandName.replace(/^!/, '');
    const filePath = path.join(__dirname, `${baseCommandName}Command.js`);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.debug(`Command file not found for ${commandName}: ${filePath}`);
      return '';
    }
    
    // Read the file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Strategy 1: Look for JSDoc with @param for args parameter in handler function
    const jsdocRegex = /\/\*\*[\s\S]*?@param[\s\S]*?{string}[\s\S]*?args[\s\S]*?-[\s\S]*?(.*?)[\s\S]*?\*\//;
    const jsdocMatch = fileContent.match(jsdocRegex);
    
    if (jsdocMatch && jsdocMatch[1]) {
      const paramDesc = jsdocMatch[1].trim();
      if (paramDesc) {
        return `Parameters for ${commandName}: ${paramDesc}`;
      }
    }
    
    // Strategy 2: Look for JSDoc in the handler registration
    const registerJsdocRegex = new RegExp(`register\\([\\s\\n]*['"]${commandName}['"][\\s\\n]*,[\\s\\n]*\\w+[\\s\\n]*,[\\s\\n]*['"]([^'"]+)['"]`);
    const registerMatch = fileContent.match(registerJsdocRegex);
    
    if (registerMatch && registerMatch[1]) {
      const helpText = registerMatch[1].trim();
      // Extract parameter info from help text if it contains a format like: command [param]
      const paramMatch = helpText.match(/\[([^\]]+)\]/);
      if (paramMatch) {
        return `Parameters for ${commandName}: ${paramMatch[1]}`;
      }
    }
    
    // Strategy 3: Look for in-line documentation in the handler function
    const handlerRegex = /function\s+handle\w+Command\s*\([^)]*\)\s*{[\s\S]*?(?:const|let)\s+([^=]+)\s*=\s*args\.trim\(\)/;
    const handlerMatch = fileContent.match(handlerRegex);
    
    if (handlerMatch && handlerMatch[1]) {
      const paramName = handlerMatch[1].trim();
      // Try to find comments describing this variable
      const paramCommentRegex = new RegExp(`(?:\\/\\/|\\*|\\/)\\s*${paramName}\\s*:?\\s*(.+?)(?:\\n|$)`, 'i');
      const paramCommentMatch = fileContent.match(paramCommentRegex);
      
      if (paramCommentMatch && paramCommentMatch[1]) {
        return `Parameters for ${commandName}: ${paramCommentMatch[1].trim()}`;
      }
      
      // Strategy 4: Look for parameter validation checks
      const validationRegex = new RegExp(`if\\s*\\(!${paramName}\\)\\s*{[\\s\\S]*?(?:required|missing)`, 'i');
      const validationMatch = fileContent.match(validationRegex);
      
      if (validationMatch) {
        return `Parameters for ${commandName}: ${paramName} (required)`;
      }
      
      return `Parameters for ${commandName}: ${paramName} (optional)`;
    }
    
    // Strategy 5: Special case handling for specific commands
    if (baseCommandName === 'clima' || baseCommandName === 'weather') {
      return `Parameters for ${commandName}: city name (optional, default: ${process.env.DEFAULT_CITY || 'Buenos Aires'})`;
    } else if (baseCommandName === 'subscribe') {
      return `Parameters for ${commandName}: channel name (required, e.g., "home", "notifications", "alerts")`;
    } else if (baseCommandName === 'unsubscribe') {
      return `Parameters for ${commandName}: channel name (required, e.g., "home", "notifications", "alerts")`;
    } else if (baseCommandName === 'notify') {
      return `Parameters for ${commandName}: channel message (required, format: "channel_name Your message here")`;
    }
    
    return '';
  } catch (error) {
    console.error(`Error extracting parameters for ${commandName}:`, error);
    return '';
  }
}

/**
 * Extract parameter specifications from webhook files
 * 
 * Uses multiple strategies to find parameter documentation in webhook files:
 * 1. JSDoc annotations for data parameters
 * 2. Parameter definitions in validation functions
 * 3. Exported parameter schemas
 * 4. Special case handling for known webhooks
 * 
 * @param {string} webhookName - Name of the webhook
 * @returns {string} Parameter specifications or empty string if not found
 * @throws {Error} Silently caught if file access or parsing fails
 */
function extractWebhookParameters(webhookName) {
  if (!webhookName) {
    return '';
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const filePath = path.join(__dirname, `../webhooks/${webhookName}Webhook.js`);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.debug(`Webhook file not found for ${webhookName}: ${filePath}`);
      return '';
    }
    
    // Read the file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Strategy 1: Try to extract from JSDoc comments for the handler function
    // Matches @param annotations for data properties in JSDoc blocks
    const jsdocRegex = /\/\*\*[\s\S]*?handle\w+Webhook[\s\S]*?@param\s+{object}\s+data[\s\S]*?@param\s+{([^}]+)}\s+data\.([^\s-]+)[\s\S]*?-[\s\S]*?(.*?)[\s\S]*?(?:\*\/|\n\s*\*\s*@)/g;
    
    let params = [];
    let match;
    while ((match = jsdocRegex.exec(fileContent)) !== null) {
      const paramType = match[1].trim();
      const paramName = match[2].trim();
      const paramDesc = match[3].trim();
      params.push(`${paramName} (${paramType}): ${paramDesc}`);
    }
    
    // If we found parameters in JSDoc, return them
    if (params.length > 0) {
      return `Required parameters for ${webhookName}:\n- ${params.join('\n- ')}`;
    }
    
    // Strategy 2: Try to find JSDoc with all parameters documented
    const fullJsdocRegex = /\/\*\*[\s\S]*?handle\w+Webhook[\s\S]*?@param\s+{object}\s+data[\s\S]*?\*\//;
    const fullJsdocMatch = fileContent.match(fullJsdocRegex);
    
    if (fullJsdocMatch) {
      // Look for individual data parameter documentation
      const paramRegex = /@param\s+{([^}]+)}\s+data\.([^\s-]+)[\s\S]*?-[\s\S]*?([^\n]*)/g;
      let paramMatch;
      let jsdocParams = [];
      
      while ((paramMatch = paramRegex.exec(fullJsdocMatch[0])) !== null) {
        const paramType = paramMatch[1].trim();
        const paramName = paramMatch[2].trim();
        const paramDesc = paramMatch[3].trim();
        jsdocParams.push(`${paramName} (${paramType}): ${paramDesc}`);
      }
      
      if (jsdocParams.length > 0) {
        return `Required parameters for ${webhookName}:\n- ${jsdocParams.join('\n- ')}`;
      }
    }
    
    // Strategy 3: Try to find parameter destructuring in the handler function
    // This helps identify required parameters even without documentation
    const destructuringRegex = /const\s+{([^}]+)}\s*=\s*data/;
    const destructuringMatch = fileContent.match(destructuringRegex);
    
    if (destructuringMatch && destructuringMatch[1]) {
      params = destructuringMatch[1]
        .split(',')
        .map(param => {
          const [name, defaultValue] = param.split('=').map(p => p.trim());
          if (defaultValue) {
            return `${name} (optional, default: ${defaultValue})`;
          }
          return `${name} (required)`;
        });
        
      return `Required parameters for ${webhookName}:\n- ${params.join('\n- ')}`;
    }
    
    // Strategy 4: Try to find parameter validation checks
    // Looks for validation statements like if(!paramName) { ... missing/required... }
    const validationRegex = /if\s*\(!([a-zA-Z0-9_]+)\)\s*{[\s\S]*?(?:missing|required|invalid).*?(?:parameter|field)/gi;
    let validationParams = [];
    let validationMatch;
    
    while ((validationMatch = validationRegex.exec(fileContent)) !== null) {
      if (validationMatch && validationMatch[1]) {
        validationParams.push(`${validationMatch[1]} (required)`);
      }
    }
    
    if (validationParams.length > 0) {
      return `Required parameters for ${webhookName}:\n- ${validationParams.join('\n- ')}`;
    }
    
    // Strategy 5: Check for valid values in validation logic
    // Looks for validation like if(!values.includes('value')) { ... not valid ... }
    const validValuesRegex = /if\s*\(!([a-zA-Z0-9_]+\.includes\(['"]([^'"]+)['"]\))[\s\S]*?([a-zA-Z0-9_]+).*?not valid/i;
    const validValuesMatch = fileContent.match(validValuesRegex);
    
    if (validValuesMatch && validValuesMatch.length >= 4) {
      const validValuesList = validValuesMatch[2].split(',').map(v => v.trim());
      return `Required parameters for ${webhookName}:\n- ${validValuesMatch[3]} (required, valid values: ${validValuesList.join(', ')})`;
    }
    
    // Strategy 6: Hardcoded known webhook parameters for better documentation
    // Provides detailed parameter information for commonly used webhooks
    if (webhookName === 'areaControl') {
      return `Required parameters for ${webhookName}:
- area (string): The area to control (valid values: office, room)
- turn (string): The state to set (valid values: on, off)`;
    } else if (webhookName === 'sendNotification' || webhookName === 'notification') {
      return `Required parameters for ${webhookName}:
- message (string): The message text to send
- to (string or array): The recipient(s) phone number or "admin" for admin users
- title (string, optional): Title for the message`;
    } else if (webhookName === 'deviceControl') {
      return `Required parameters for ${webhookName}:
- device (string): The device ID to control
- action (string): The action to perform (valid values: on, off, toggle)`;
    } else if (webhookName === 'scene') {
      return `Required parameters for ${webhookName}:
- scene (string): The scene name to activate`;
    } else if (webhookName === 'sensorReport') {
      return `Required parameters for ${webhookName}:
- sensor (string): The sensor ID to report
- type (string, optional): The type of report (valid values: current, history)`;
    }
    
    return '';
  } catch (error) {
    console.error(`Error extracting parameters for ${webhookName}:`, error);
    return '';
  }
}

/**
 * Generate a system prompt with available commands and webhooks information
 * 
 * This creates a comprehensive prompt that includes:
 * 1. All available commands with their help text and parameter specifications
 * 2. All available webhooks with their descriptions and parameter requirements
 * 3. Instructions for the AI model on how to format function calls
 * 
 * @returns {string} System prompt with available commands and webhooks
 */
function generateSystemPrompt() {
  // For filesystem operations
  const fs = require('fs');
  const path = require('path');
  
  // Get all available commands with their help text
  const availableCommands = Array.from(commandHandler.commands.keys())
    .map(cmd => {
      // Find help message for this command
      const helpIndex = commandHandler.helpMessages.findIndex(help => help.startsWith(cmd));
      const helpText = helpIndex >= 0 ? commandHandler.helpMessages[helpIndex] : cmd;
      
      // Extract parameter specifications
      const paramSpecs = extractCommandParameters(cmd);
      return paramSpecs ? `${helpText}\n${paramSpecs}` : helpText;
    });
  
  // Get all available webhooks with their descriptions and parameter requirements
  const availableWebhooks = webhookHandler.getWebhooksInfo()
    .map(webhook => {
      if (!webhook || !webhook.name) return null;
      
      const basicInfo = `${webhook.name}: ${webhook.description || 'No description available'}`;
      
      // Extract parameter specifications
      const paramSpecs = extractWebhookParameters(webhook.name);
      return paramSpecs ? `${basicInfo}\n${paramSpecs}` : basicInfo;
    })
    .filter(Boolean); // Remove any null entries

  // Build specific webhook parameter information
  const webhookParamInfo = [];
  
  // For each webhook, get detailed parameter info
  const webhookList = webhookHandler.getWebhooksInfo();
  for (const webhook of webhookList) {
    try {
      const paramInfo = parameterExtraction.getWebhookParameterInfo(webhook.name);
      const paramDefs = parameterExtraction.getParameterDefinitions(webhook.name);
      
      let paramDetails = `${webhook.name}: ${webhook.description}\n`;
      paramDetails += 'Required parameters:\n';
      
      // Add required parameters with their valid values
      for (const paramName of paramInfo.required) {
        const paramDef = paramDefs.parameters[paramName];
        const validValues = paramDef && paramDef.validValues ? ` (valid values: ${paramDef.validValues.join(', ')})` : '';
        paramDetails += `- ${paramName}${validValues}\n`;
      }
      
      // Add optional parameters
      if (paramInfo.optional && paramInfo.optional.length > 0) {
        paramDetails += 'Optional parameters:\n';
        for (const paramName of paramInfo.optional) {
          const paramDef = paramDefs.parameters[paramName];
          const validValues = paramDef && paramDef.validValues ? ` (valid values: ${paramDef.validValues.join(', ')})` : '';
          paramDetails += `- ${paramName}${validValues}\n`;
        }
      }
      
      // Add examples
      if (paramDefs.examples && paramDefs.examples.length > 0) {
        paramDetails += 'Examples:\n';
        for (const example of paramDefs.examples) {
          paramDetails += `- ${JSON.stringify(example)}\n`;
        }
      }
      
      webhookParamInfo.push(paramDetails);
    } catch (error) {
      console.error(`Error getting parameter info for ${webhook.name}:`, error);
    }
  }

  const systemPrompt = `
You are a smart WhatsApp assistant capable of answering questions and executing commands.
Respond concisely, clearly, and in a friendly, natural tone.

AVAILABLE COMMANDS WITH PARAMETERS:
${availableCommands.join('\n\n')}

AVAILABLE WEBHOOKS WITH PARAMETERS:
${webhookParamInfo.join('\n\n')}

FUNCTION EXECUTION CAPABILITIES:
If the user requests an action that matches an available command or webhook,
you MUST use the corresponding function to execute it properly, following the specified parameter requirements EXACTLY.

For commands: 
  __execute_command("!command", "arguments")
  - The first parameter must be the full command including the '!' symbol
  - The second parameter should be the arguments as a string
  - Refer to the command's parameter specifications above when formatting arguments
  - IMPORTANT: Follow the exact parameter format required by each command

For webhooks: 
  __execute_webhook("webhook_name", {data})
  - The first parameter is the webhook internal name (e.g., "area_control", "send_notification")
  - The second parameter is a JSON object with the required parameters EXACTLY as specified above
  - All required parameters must be included with the correct data types
  - Parameter names must match EXACTLY what's specified in the requirements
  - CRITICAL: Missing or incorrect parameters will cause the action to fail

PARAMETER VALIDATION IS CRITICAL:
- Required parameters must always be included in the data object
- Optional parameters can be omitted, but if included must use the correct format
- String values should be in quotes in the JSON object
- Do not add parameters that aren't specified in the requirements
- For webhooks, using the exact parameter name and valid values is crucial
- If a parameter has a list of valid values, you MUST use one from the list

WEBHOOK PARAMETER EXAMPLES:
- Area Control: __execute_webhook("area_control", {"area": "office", "turn": "off"})
- Device Control: __execute_webhook("device_control", {"device": "light", "action": "on"})
- Scene Activation: __execute_webhook("scene", {"scene": "movie"})
- Notification: __execute_webhook("send_notification", {"message": "Hello", "to": "admin"})

USAGE EXAMPLES:
1. If the user asks: "What's the weather like in Madrid?"
   Your response: "I'll check the weather for you. __execute_command("!clima", "Madrid")"

2. If the user says: "Turn off the office lights"
   Your response: "Turning off the office lights. __execute_webhook("area_control", {"area": "office", "turn": "off"})"

3. If the user says: "Send a message to Luis saying I'll be late"
   Your response: "Sending the notification. __execute_webhook("send_notification", {"to": "Luis", "message": "I'll be late"})"

4. If the user says: "Active the movie scene"
   Your response: "Activating the movie scene. __execute_webhook("scene", {"scene": "movie"})"

DO NOT use these functions if the user isn't clearly requesting a related action.
If the user simply asks a general question that doesn't require executing a specific action, just reply normally.
When using a function, briefly explain what you're going to do before calling the function.
For each webhook, use EXACTLY the parameter names and structure specified in the parameter requirements.
`;

  return systemPrompt;
}

/**
 * Log function calls made by the chatbot to a file for auditing and debugging
 * 
 * @param {string} type - Type of function call ('command' or 'webhook')
 * @param {object} data - Data about the function call
 * @returns {Promise<void>} A promise that resolves when logging is complete
 * @throws {Error} If logging fails (caught internally)
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
      // Ignore if directory already exists
      if (err.code !== 'EEXIST') {
        console.error('Error creating logs directory:', err);
      }
    }
    
    // Format log entry as JSON
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type || 'unknown',
      data: data || {},
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
 * Call AI model based on specified provider and model
 * @param {string} provider - AI provider ('ollama' or 'openai')
 * @param {string} model - Model name to use
 * @param {string} systemPrompt - System prompt to send
 * @param {string} userMessage - User message to process
 * @param {object} options - Additional options like function definitions
 * @returns {Promise<object>} - Response with text and function call info
 */
async function callAIModel(provider, model, systemPrompt, userMessage, options = {}) {
  console.log(`Calling ${provider.toUpperCase()} model "${model}" for purpose: ${options.purpose || 'general'}`);
  
  if (provider.toLowerCase() === 'openai' && OpenAI && CONFIG.OPENAI_API_KEY) {
    return callOpenAI(model, systemPrompt, userMessage, options);
  } else {
    return callOllama(model, systemPrompt, userMessage, options);
  }
}

/**
 * Call OpenAI with the provided parameters
 * @param {string} model - OpenAI model to use
 * @param {string} systemPrompt - System prompt
 * @param {string} userMessage - User message
 * @param {object} options - Additional options
 * @returns {Promise<object>} - Response with text and function call info
 */
async function callOpenAI(model, systemPrompt, userMessage, options = {}) {
  try {
    // Initialize OpenAI client
    const openaiOptions = {
      apiKey: CONFIG.OPENAI_API_KEY,
    };
    
    if (CONFIG.OPENAI_ORG_ID) {
      openaiOptions.organization = CONFIG.OPENAI_ORG_ID;
    }
    
    const openai = new OpenAI(openaiOptions);
    
    // Call OpenAI API
    const apiParams = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 800,
    };
    
    // Add function calling if specified in options
    if (options.functions) {
      // For FUNCTION_AI_PROVIDER, use dynamically generated webhook functions
      if (options.purpose === 'function' || options.purpose === 'webhook') {
        // Generate webhook-specific function definitions based on parameter extraction
        const webhookFunctions = generateWebhookFunctionDefinitions();
        
        // Add the command function and any other functions from options
        const commandFunction = options.functions.find(f => f.name === 'execute_command');
        const allFunctions = commandFunction ? [commandFunction, ...webhookFunctions] : [...webhookFunctions, ...options.functions];
        
        apiParams.tools = allFunctions.map(func => ({ 
          type: "function", 
          function: func 
        }));
      } else {
        // For other purposes, use the functions as provided
        apiParams.tools = options.functions.map(func => ({ 
          type: "function", 
          function: func 
        }));
      }
    }
    
    const completion = await openai.chat.completions.create(apiParams);
    
    const responseMessage = completion.choices[0]?.message;
    let functionCall = null;
    
    // Check if the model wants to call a function
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      
      if (toolCall.function) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`OpenAI requested function call: ${functionName}`, functionArgs);
        
        // Convert to our internal function call format
        if (functionName === 'execute_command') {
          functionCall = {
            command: functionArgs.command,
            args: functionArgs.args || '',
          };
        } else if (functionName === 'execute_webhook') {
          // Get webhook info
          const webhookName = functionArgs.webhook;
          const webhookInfo = webhookHandler.findWebhook(webhookName);
          let webhookData = functionArgs.data || {};
          
          if (webhookInfo) {
            // Extract parameter specifications for this webhook
            const paramSpecs = extractWebhookParameters(webhookName);
            
            if (Object.keys(webhookData).length === 0) {
              console.warn(`${webhookName} webhook missing parameters, attempting to extract from user message`);
              
              // Extract parameters from user message based on parameter specifications
              webhookData = extractParametersFromMessage(userMessage, webhookName, paramSpecs);
            }
          }
          
          functionCall = {
            webhook: functionArgs.webhook,
            data: webhookData
          };
        } else if (functionName === 'detect_intent') {
          functionCall = {
            intent: functionArgs.intent,
            confidence: functionArgs.confidence || 0.0,
            reason: functionArgs.reason || '',
          };
        }
      }
    }
    
    return {
      text: responseMessage.content || '',
      functionCall: functionCall,
      raw: responseMessage
    };
  } catch (error) {
    console.error('Error using OpenAI API:', error);
    throw error;
  }
}

/**
 * Call Ollama with the provided parameters
 * @param {string} model - Ollama model to use
 * @param {string} systemPrompt - System prompt
 * @param {string} userMessage - User message
 * @param {object} options - Additional options
 * @returns {Promise<object>} - Response with text and function call info
 */
async function callOllama(model, systemPrompt, userMessage, options = {}) {
  try {
    const data = await safeApiRequest(`${CONFIG.OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: false
      })
    }, 120000); // 120 second timeout
    
    const responseText = data.message?.content || data.response || 'No recibí respuesta clara del modelo de IA.';
    
    // For Ollama, parse any function calls from the text response
    let functionCall = null;
    if (options.purpose === 'function' || options.purpose === 'intent') {
      const functionCallRegex = /__execute_(?:command|webhook|intent)\([^)]+\)/;
      const functionCallMatch = responseText.match(functionCallRegex);
      
      if (functionCallMatch) {
        functionCall = parseFunctionCallText(functionCallMatch[0]);
      }
    }
    
    return {
      text: responseText,
      functionCall: functionCall,
      raw: data
    };
  } catch (error) {
    console.error('Error using Ollama API:', error);
    throw error;
  }
}

/**
 * Parse function call from text response (used for Ollama responses)
 * @param {string} functionCallText - The function call text to parse
 * @returns {object|null} - Parsed function call or null
 */
function parseFunctionCallText(functionCallText) {
  // Existing command parsing logic
  const commandMatch = functionCallText.match(/__execute_command\(['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?\)/);
  if (commandMatch) {
    return {
      command: commandMatch[1],
      args: commandMatch[2] || ''
    };
  }
  
  // Existing webhook parsing logic
  const webhookMatch = functionCallText.match(/__execute_webhook\(['"]([^'"]+)['"](?:,\s*({.+?}))?\)/s);
  if (webhookMatch) {
    try {
      const webhookId = webhookMatch[1];
      const webhookDataStr = webhookMatch[2] || '{}';
      
      // Parse JSON data
      const jsonStr = webhookDataStr
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":');
      
      const webhookData = JSON.parse(jsonStr);
      
      return {
        webhook: webhookId,
        data: webhookData
      };
    } catch (parseError) {
      console.error('Error parsing webhook data:', parseError);
    }
  }
  
  // New intent parsing logic
  const intentMatch = functionCallText.match(/__execute_intent\(['"]([^'"]+)['"](?:,\s*([\d\.]+))?\)/);
  if (intentMatch) {
    return {
      intent: intentMatch[1],
      confidence: parseFloat(intentMatch[2] || '1.0')
    };
  }
  
  return null;
}

/**
 * Generate a system prompt for intent detection
 * @returns {string} - Intent detection system prompt
 */
function generateIntentPrompt() {
  // Get all available commands and their help text for more accurate intent detection
  const availableCommands = Array.from(commandHandler.commands.keys())
    .map(cmd => {
      const helpIndex = commandHandler.helpMessages.findIndex(help => help.startsWith(cmd));
      const helpText = helpIndex >= 0 ? commandHandler.helpMessages[helpIndex] : cmd;
      return helpText;
    });
  
  // Get all available webhooks and their descriptions
  const availableWebhooks = webhookHandler.getWebhooksInfo()
    .map(webhook => `${webhook.name}: ${webhook.description}`);

  return `
You are an intent classifier for a WhatsApp bot. Your job is to analyze user messages and determine
if they are requesting one of the following intents:

1. CHAT: The user is asking a general question or having a conversation
2. COMMAND: The user wants to execute a specific command
3. WEBHOOK: The user wants to control a device or service via webhook

AVAILABLE COMMANDS:
${availableCommands.join('\n')}

AVAILABLE WEBHOOKS:
${availableWebhooks.join('\n')}

Examine the user's message and classify the intent based on:
- If it matches or is similar to any of the available commands -> COMMAND
- If it appears to be requesting control of a device or service -> WEBHOOK
- If it's a general question or conversation -> CHAT

Respond only with the intent classification using this format:
__execute_intent("INTENT_TYPE", CONFIDENCE_SCORE)

Where:
- INTENT_TYPE is one of: CHAT, COMMAND, or WEBHOOK
- CONFIDENCE_SCORE is a number between 0.0 and 1.0

Examples:
- "What's the weather like in Madrid?" -> __execute_intent("COMMAND", 0.9)
- "Tell me about quantum physics" -> __execute_intent("CHAT", 0.95)
- "Turn off the lights in the office" -> __execute_intent("WEBHOOK", 0.8)
- "Hello, how are you?" -> __execute_intent("CHAT", 0.9)
`;
}

/**
 * Handle chatbot messages and process potential function calls
 * 
 * This is the main entry point for the chatbot, processing user messages that don't
 * start with command prefixes. It follows a three-step process:
 * 1. Detect user intent (chat, command, webhook)
 * 2. Generate appropriate response based on intent
 * 3. Execute any function calls detected in the response
 * 
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} text - User's message text
 * @returns {Promise<void>} A promise that resolves when message processing is complete
 * @throws {Error} If there's an issue with message processing
 */
async function handleChatbotMessage(msg, text) {
  if (!text || typeof text !== 'string') {
    console.warn('Invalid message text received by chatbot handler');
    return;
  }
  
  console.log('Processing chatbot message:', text);
  
  try {
    // Step 1: Detect the user's intent using a small model
    console.log('Step 1: Detecting user intent...');
    const intentPrompt = generateIntentPrompt();
    let detectedIntent = 'CHAT'; // Default to chat if intent detection fails
    
    try {
      // Intent detection function for OpenAI
      const intentFunctions = [
        {
          name: "detect_intent",
          description: "Detect the user's intent from their message",
          parameters: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["CHAT", "COMMAND", "WEBHOOK"],
                description: "The detected intent type",
              },
              confidence: {
                type: "number",
                description: "Confidence score between 0 and 1",
              },
              reason: {
                type: "string",
                description: "Reason for the intent classification",
              }
            },
            required: ["intent"],
          },
        }
      ];
      
      const intentResponse = await callAIModel(
        CONFIG.INTENT_AI_PROVIDER,
        CONFIG.INTENT_AI_MODEL,
        intentPrompt,
        text,
        { 
          purpose: 'intent', 
          temperature: 0.3, 
          maxTokens: 100,
          functions: CONFIG.INTENT_AI_PROVIDER.toLowerCase() === 'openai' ? intentFunctions : undefined
        }
      );
      
      if (intentResponse.functionCall && intentResponse.functionCall.intent) {
        detectedIntent = intentResponse.functionCall.intent;
        const confidence = intentResponse.functionCall.confidence || 'N/A';
        const reason = intentResponse.functionCall.reason || 'No reason provided';
        console.log(`Intent detected: ${detectedIntent} with confidence ${confidence}`);
        console.log(`Reason: ${reason}`);
      } else {
        // Try to parse intent from text response as fallback
        const intentRegex = /__execute_intent\(['"]([A-Z]+)['"]/;
        const match = intentResponse.text.match(intentRegex);
        if (match && ['CHAT', 'COMMAND', 'WEBHOOK'].includes(match[1])) {
          detectedIntent = match[1];
          console.log(`Intent parsed from text: ${detectedIntent}`);
        } else {
          console.log('Could not detect intent from model response, defaulting to CHAT');
        }
      }
    } catch (intentError) {
      console.error('Error detecting intent:', intentError);
      console.log('Defaulting to CHAT intent due to error');
    }
    
    // Step 2: Process the message based on the detected intent
    let aiResponse = null;
    let functionCall = null;
    
    console.log(`Processing message with detected intent: ${detectedIntent}`);
    
    // Common function definition for command execution
    const commandFunction = {
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
    };
    
    // Define API options based on intent
    let aiProviderName = CONFIG.CHAT_AI_PROVIDER;  // Default to chat provider
    let modelName = CONFIG.CHAT_AI_MODEL;          // Default to chat model
    let purpose = 'chat';                          // Default purpose
    let functionsToUse = [];                       // No functions by default
    
    // Adjust model and functions based on intent
    if (detectedIntent === 'COMMAND') {
      aiProviderName = CONFIG.FUNCTION_AI_PROVIDER;
      modelName = CONFIG.FUNCTION_AI_MODEL;
      purpose = 'command';
      functionsToUse = [commandFunction];
    } else if (detectedIntent === 'WEBHOOK') {
      aiProviderName = CONFIG.FUNCTION_AI_PROVIDER;
      modelName = CONFIG.FUNCTION_AI_MODEL;
      purpose = 'webhook';
      // For webhooks, we'll generate dynamic function definitions in the callAIModel function
      functionsToUse = [commandFunction]; // Add command function as a base
    }
    
    // Add the webhook function definition
    functionsToUse.push({
      name: "execute_webhook",
      description: "Execute a webhook to control Home Assistant",
      parameters: {
        type: "object",
        properties: {
          webhook: {
            type: "string",
            description: "The webhook name to execute (internal name)",
            enum: getAvailableWebhookNames()
          },
          data: {
            type: "object",
            description: "The data to send to the webhook. The required parameters depend on which webhook is being called."
          }
        },
        required: ["webhook", "data"],
      }
    });
    
    // Add the intent detection function if needed
    functionsToUse.push({
      name: "detect_intent",
      description: "Detect the user's intent from their message",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["CHAT", "COMMAND", "WEBHOOK"],
            description: "The detected intent type",
          },
          confidence: {
            type: "number",
            description: "Confidence score between 0 and 1",
          },
          reason: {
            type: "string",
            description: "Reason for the intent classification",
          }
        },
        required: ["intent"],
      }
    });
    
    if (detectedIntent === 'CHAT') {
      // For chat intent, use the chat model
      console.log('Step 2: Processing as CHAT using chat model');
      const chatSystemPrompt = `You are a helpful, friendly WhatsApp assistant. 
Respond concisely, clearly, and in a friendly tone. 
Avoid suggesting actions that would require executing commands or webhooks.`;
      
      try {
        const chatResponse = await callAIModel(
          CONFIG.CHAT_AI_PROVIDER,
          CONFIG.CHAT_AI_MODEL,
          chatSystemPrompt,
          text,
          { purpose: 'chat', temperature: 0.7 }
        );
        
        aiResponse = chatResponse.text;
      } catch (chatError) {
        console.error('Error getting chat response:', chatError);
        aiResponse = 'Lo siento, tuve un problema generando una respuesta. Por favor intenta de nuevo.';
      }
    } else {
      // For command or webhook intents, use the function model
      console.log(`Step 2: Processing as ${detectedIntent} using function model`);
      const systemPrompt = generateSystemPrompt(); // Get full prompt with commands and webhooks
      
      try {
        const functionResponse = await callAIModel(
          aiProviderName,
          modelName,
          systemPrompt,
          text,
          { purpose: purpose, functions: functionsToUse }
        );
        
        aiResponse = functionResponse.text;
        functionCall = functionResponse.functionCall;
        
        // If no function call was detected but we're in COMMAND/WEBHOOK intent,
        // check for text-based function calls
        if (!functionCall) {
          const functionCallRegex = /__execute_(?:command|webhook)\([^)]+\)/;
          const functionCallMatch = aiResponse.match(functionCallRegex);
          
          if (functionCallMatch) {
            functionCall = parseFunctionCallText(functionCallMatch[0]);
            console.log('Detected text-based function call:', functionCall);
            
            // Remove the function call from the response
            aiResponse = aiResponse.replace(functionCallRegex, '').trim();
            
            // Clean up any double spaces or newlines that might be left
            aiResponse = aiResponse
              .replace(/\s+/g, ' ')
              .replace(/\n\s*\n\s*\n/g, '\n\n')
              .trim();
          } else if (detectedIntent === 'COMMAND' || detectedIntent === 'WEBHOOK') {
            console.log('Intent was for command/webhook but no function call detected');
          }
        }
      } catch (functionError) {
        console.error('Error getting function response:', functionError);
        aiResponse = 'Lo siento, tuve un problema procesando tu petición. Por favor intenta de nuevo.';
      }
    }
    
    console.log('AI response received:', (aiResponse || '').substring(0, 100) + '...');
    const responseToUser = aiResponse;
    
    // If function calls are disabled but we detected a function call, inform the user
    if (!areFunctionCallsEnabled() && functionCall) {
      // Add a note about the disabled function
      let actionType = functionCall.command ? 'comando' : 'acción';
      let actionName = functionCall.command || functionCall.webhook || 'desconocida';
      
      responseToUser += `\n\n_La ejecución automática de ${actionType}s está desactivada. Usa !settings funciones on para activarla._`;
      
      // Just send the message with the warning and don't execute the function
      await msg.reply(responseToUser);
      return;
    }
    
    // Step 3: Execute the function call if present
    if (functionCall) {
      // Execute the command if found
      if (functionCall.command && commandHandler.commands.has(functionCall.command)) {
        const handler = commandHandler.commands.get(functionCall.command);
        console.log(`Step 3: Executing command: ${functionCall.command} with args: ${functionCall.args}`);
        
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
        console.log(`Step 3: Executing webhook: ${functionCall.webhook} with data:`, functionCall.data);
        
        // Find the webhook by name or ID
        const webhookInfo = webhookHandler.findWebhook(functionCall.webhook);
        
        if (!webhookInfo) {
          await msg.reply(`❌ No encontré el webhook "${functionCall.webhook}". Por favor verifica el nombre.`);
          return;
        }
        
        // First, try to extract any missing parameters from the user message
        const initialParams = functionCall.data || {};
        const extractedParams = parameterExtraction.extractParametersFromMessage(text, webhookInfo.name, initialParams);
        
        // Replace the original data with the combined parameters
        functionCall.data = extractedParams;
        
        // Validate the parameters
        const validationResult = parameterExtraction.validateParameters(webhookInfo.name, functionCall.data);
        
        if (!validationResult.isValid) {
          // Generate a helpful error message based on validation results
          const errorMessage = parameterExtraction.generateErrorMessage(webhookInfo.name, validationResult);
          await msg.reply(errorMessage);
          
          // For debugging only
          console.log('Parameter validation failed:', validationResult);
          return;
        }
        
        // Log extracted parameters for debugging
        console.log('Final parameters for webhook call:', functionCall.data);
        
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
    }
    
    // If no function call was executed or it was a chat intent, just send the AI response
    console.log('Step 3: No function to execute, sending chat response');
    await msg.reply(responseToUser);
    
  } catch (error) {
    console.error('Error processing chatbot message:', error);
    msg.reply('Lo siento, tuve un problema procesando tu mensaje. Por favor intenta de nuevo.');
  }
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Main chatbot message handler function
   */
  handleChatbotMessage,
  
  /**
   * Sets the WhatsApp client reference for direct client access
   * 
   * @param {Object} client - WhatsApp client instance
   */
  setClient: (client) => {
    if (!client || typeof client !== 'object') {
      console.warn('Invalid WhatsApp client provided to chatbot module');
      return;
    }
    whatsappClient = client;
  }
};
