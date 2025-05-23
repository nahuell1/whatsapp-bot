/**
 * WhatsApp Bot Main Module
 * Integrates WhatsApp with AI providers and Home Assistant
 * 
 * @module bot
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const express = require('express');
const fetch = require('node-fetch');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

/**
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  // API Connection Settings
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID || '',
  
  // Default AI Provider and Model
  DEFAULT_AI_PROVIDER: process.env.DEFAULT_AI_PROVIDER || 'ollama',
  DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Multi-model configuration
  INTENT_AI_PROVIDER: process.env.INTENT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  INTENT_AI_MODEL: process.env.INTENT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  CHAT_AI_PROVIDER: process.env.CHAT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  CHAT_AI_MODEL: process.env.CHAT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  FUNCTION_AI_PROVIDER: process.env.FUNCTION_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  FUNCTION_AI_MODEL: process.env.FUNCTION_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Server configuration
  PORT: parseInt(process.env.PORT || '3000', 10),
  SESSION_DIR: process.env.SESSION_DIR || path.resolve(__dirname, 'session'),
  COMMAND_PREFIX: process.env.COMMAND_PREFIX || '!ia',
  
  // Home Assistant configuration
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
  WEBHOOK_API_KEY: process.env.WEBHOOK_API_KEY || '',
  REQUIRE_WEBHOOK_AUTH: process.env.REQUIRE_WEBHOOK_AUTH === 'true'
};

/**
 * Initialize WhatsApp client with authentication and browser settings
 * @constant {Client}
 */
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: CONFIG.SESSION_DIR }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions'
    ]
  }
});

/**
 * Track the last QR code for web display
 * @type {string|null}
 */
let lastQR = null;

/**
 * WhatsApp client event handlers
 * Handle authentication, QR code generation, and connection states
 */

/**
 * QR code event handler
 * Generates terminal QR code and stores it for web display
 */
client.on('qr', qr => {
  console.log('New QR code generated, available at /qr.png');
  lastQR = qr;
  qrcodeTerminal.generate(qr, { small: true });
});

/**
 * Authentication success event handler
 * Clears QR code when no longer needed
 */
client.on('authenticated', () => {
  console.log('✅ Authentication successful');
  lastQR = null;
});

/**
 * Authentication failure event handler
 * Provides troubleshooting guidance
 */
client.on('auth_failure', msg => {
  console.error('❌ Authentication failure:', msg);
  console.log('Try removing the session/ directory and restart the bot');
});

/**
 * Ready event handler
 * Sets up connections between modules when client is ready
 */
client.on('ready', () => {
  console.log('✅ WhatsApp client connected and ready');
  
  // Initialize subsystems
  initializeCommands();
  initializeWebhooks();
  initializeChatbot();
  initializeNotificationSystem();
});

/**
 * Initialize command system with client reference
 */
function initializeCommands() {
  if (typeof commands.setClientInCommands === 'function') {
    commands.setClientInCommands(client);
    console.log('✅ Command system initialized');
  } else {
    console.warn('⚠️ Command system could not be initialized: missing setClientInCommands method');
  }
}

/**
 * Initialize webhook system with client reference
 */
function initializeWebhooks() {
  if (typeof webhooks.setClientInWebhooks === 'function') {
    webhooks.setClientInWebhooks(client);
    console.log('✅ Webhook system initialized');
  } else {
    console.warn('⚠️ Webhook system could not be initialized: missing setClientInWebhooks method');
  }
}

/**
 * Initialize chatbot handler with client reference
 */
function initializeChatbot() {
  try {
    const chatbotHandler = require('./commands/chatbotCommand');
    if (typeof chatbotHandler.setClient === 'function') {
      chatbotHandler.setClient(client);
      console.log('✅ Chatbot handler initialized');
    }
  } catch (error) {
    console.error('⚠️ Chatbot system could not be initialized:', error.message);
  }
}

/**
 * Initialize notification system and connect it to webhooks
 */
function initializeNotificationSystem() {
  try {
    // Import direct reference to notifySubscribers from subscribeCommand
    const { notifySubscribers } = require('./commands/subscribeCommand');
    
    // Set the notifier in webhookUtils
    if (typeof notifySubscribers === 'function') {
      webhookUtils.setNotifier(notifySubscribers);
      console.log('✅ Notification system connected to webhooks');
    }
  } catch (error) {
    console.error('⚠️ Error connecting notification system:', error.message);
  }
}

/**
 * Loading screen event handler
 * Provides loading progress updates
 */
client.on('loading_screen', (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

/**
 * Disconnection event handler
 * Cleans up state and logs disconnect reason
 */
client.on('disconnected', reason => {
  console.warn('❌ Disconnected:', reason);
  lastQR = null;
});

// Load module dependencies
const commands = require('./commands');
const webhooks = require('./webhooks');

/**
 * Import required module dependencies
 */
const webhookUtils = require('./webhooks/webhookUtils');
const chatbotHandler = require('./commands/chatbotCommand');
const messageFilter = require('./commands/messageFilter');

/**
 * Message event handler
 * Processes incoming WhatsApp messages and routes them to appropriate handlers
 * Only allows messages from admin numbers configured in ADMIN_NUMBERS env variable
 * 
 * @async
 * @param {Object} msg - The WhatsApp message object
 */
client.on('message', async msg => {
  console.log('Message received:', msg.body);
  
  try {
    // Check if the sender is authorized (admin number)
    const isAuthorized = await messageFilter.isAuthorizedSender(msg);
    
    if (!isAuthorized) {
      console.log('Unauthorized message received. Ignoring.');
      return;
    }
    
    // Let the command handler process the message
    // It will return true if a command was handled
    const wasHandled = await commands.handleMessage(msg);
    
    if (!wasHandled) {
      // If the message starts with the command prefix but wasn't handled
      if (msg.body.startsWith(CONFIG.COMMAND_PREFIX)) {
        console.log('No command matched, but message has command prefix');
        msg.reply('Comando no reconocido. Envía !help para ver los comandos disponibles.');
      } 
      // If message doesn't start with a command prefix, handle as chatbot
      else if (!msg.body.startsWith('!')) {
        // Pass to chatbot handler
        await chatbotHandler.handleChatbotMessage(msg, msg.body);
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    // Only reply with error if in development mode
    if (process.env.NODE_ENV === 'development') {
      msg.reply('❌ Error processing message: ' + error.message);
    }
  }
});

/**
 * Initialize the WhatsApp client
 * This starts the connection process and will trigger QR code generation
 */
console.log('Starting WhatsApp client...');
client.initialize().catch(error => {
  console.error('Error initializing client:', error);
});

/**
 * Setup web server for QR code display
 * Provides a web interface to scan the QR code
 * @type {Express.Application}
 */
const app = express();

app.get('/', (_, res) => {
  res.send(`
    <html>
      <head>
        <title>WhatsApp Bot QR Code</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; text-align: center; padding: 20px; }
          img { max-width: 300px; margin: 20px auto; display: block; }
        </style>
      </head>
      <body>
        <h1>WhatsApp Bot QR Code</h1>
        ${lastQR 
          ? '<img src="/qr.png" alt="QR Code" />'
          : '<p>No QR code available. If you already scanned, the bot should be connected.</p>'
        }
        <p>Status: <span id="status">Checking...</span></p>
        <script>
          setInterval(() => {
            fetch('/status')
              .then(r => r.text())
              .then(status => {
                document.getElementById('status').textContent = status;
                if (status === 'Waiting for QR' || status === 'QR Available') {
                  location.reload();
                }
              });
          }, 5000);
        </script>
      </body>
    </html>
  `);
});

app.get('/status', (_, res) => {
  if (client.pupBrowser && client.pupPage) {
    res.send(lastQR ? 'QR Available' : 'Connected');
  } else {
    res.send('Starting...');
  }
});

/**
 * QR code image endpoint
 * Serves the generated QR code as a PNG image
 * 
 * @async
 */
app.get('/qr.png', async (_, res) => {
  if (!lastQR) return res.status(503).send('QR code not yet generated.');
  try {
    const png = await qrcode.toBuffer(lastQR, { width: 300 });
    res.type('png').send(png);
  } catch (error) {
    res.status(500).send(`Error generating PNG: ${error.message}`);
  }
});

/**
 * Middleware to verify API key for webhooks
 * Provides authentication for webhook endpoints
 * 
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const verifyWebhookApiKey = (req, res, next) => {
  if (!CONFIG.REQUIRE_WEBHOOK_AUTH) {
    return next(); // Skip authentication if not required
  }
  
  const apiKey = req.headers['x-api-key'];
  
  // No API key in environment, but we're requiring auth
  if (!CONFIG.WEBHOOK_API_KEY) {
    console.error('Webhook authentication is required but no API key is configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // No API key provided or incorrect key
  if (!apiKey || apiKey !== CONFIG.WEBHOOK_API_KEY) {
    console.error('Invalid or missing API key for webhook request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // API key is valid
  next();
};

/**
 * Webhook endpoint for Home Assistant integration
 * Processes incoming webhook requests from Home Assistant
 * 
 * @async
 */
app.post('/webhook/:id', express.json(), verifyWebhookApiKey, async (req, res) => {
  const webhookId = req.params.id;
  const data = req.body;
  
  console.log(`Received webhook request for: ${webhookId}`);
  
  try {
    const result = await webhooks.handleWebhook(webhookId, data);
    
    if (result.success === false) {
      console.error(`Webhook error (${webhookId}):`, result.message || result.error);
      res.status(400).json({ 
        success: false,
        error: result.message || result.error || 'Unknown error',
        webhookId
      });
    } else {
      console.log(`Webhook processed (${webhookId}):`, result);
      res.status(200).json({
        success: true,
        ...result,
        webhookId
      });
    }
  } catch (error) {
    console.error(`Webhook execution error (${webhookId}):`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Available webhooks listing endpoint
 * Returns information about all registered webhooks
 */
app.get('/webhooks', verifyWebhookApiKey, (_, res) => {
  try {
    const webhookInfo = webhooks.getWebhooksInfo();
    res.json({ 
      success: true,
      webhooks: webhookInfo,
      count: webhookInfo.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Initialize and start the HTTP server
 */
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`✅ Bot server running at http://0.0.0.0:${CONFIG.PORT}/`);
  console.log(`✅ Webhooks available at http://0.0.0.0:${CONFIG.PORT}/webhook/:id`);
});
