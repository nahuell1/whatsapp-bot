// WhatsApp Bot with Ollama AI integration
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const express = require('express');
const fetch = require('node-fetch');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

// Environment variables with defaults
const CONFIG = {
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mi-bot',
  PORT: parseInt(process.env.PORT || '3000', 10),
  SESSION_DIR: process.env.SESSION_DIR || path.resolve(__dirname, 'session'),
  COMMAND_PREFIX: process.env.COMMAND_PREFIX || '!ia',
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123',
  WEBHOOK_API_KEY: process.env.WEBHOOK_API_KEY || '',
  REQUIRE_WEBHOOK_AUTH: process.env.REQUIRE_WEBHOOK_AUTH === 'true'
};

// Initialize WhatsApp client
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

// Track the last QR code for web display
let lastQR = null;

// Event handlers
client.on('qr', qr => {
  console.log('New QR code generated, available at /qr.png');
  lastQR = qr;
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ Authentication successful');
  lastQR = null;
});

client.on('auth_failure', msg => {
  console.error('❌ Authentication failure:', msg);
  console.log('Try removing the session/ directory and restart the bot');
});

client.on('ready', () => {
  console.log('✅ WhatsApp client connected and ready');
  // Pass client reference to commands that need it
  commands.setClientInCommands(client);
  
  // Pass client reference to webhooks that need it
  if (typeof webhooks.setClientInWebhooks === 'function') {
    webhooks.setClientInWebhooks(client);
  }
  
  // Pass client reference to the chatbot handler
  const chatbotHandler = require('./commands/chatbotCommand');
  if (typeof chatbotHandler.setClient === 'function') {
    chatbotHandler.setClient(client);
    console.log('✅ Chatbot handler initialized');
  }
  
  // Connect the subscription notification system to webhooks
  try {
    // Import direct reference to notifySubscribers from subscribeCommand
    const { notifySubscribers } = require('./commands/subscribeCommand');
    
    // Set the notifier in webhookUtils
    if (typeof notifySubscribers === 'function') {
      webhookUtils.setNotifier(notifySubscribers);
      console.log('✅ Notification system connected to webhooks');
    }
  } catch (error) {
    console.error('Error connecting notification system:', error);
  }
});

client.on('loading_screen', (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

client.on('disconnected', reason => {
  console.warn('❌ Disconnected:', reason);
  lastQR = null;
});

// Load command and webhook handlers
const commands = require('./commands');
const webhooks = require('./webhooks');

// Import webhook utilities
const webhookUtils = require('./webhooks/webhookUtils');

// Import chatbot handler for non-command messages
const chatbotHandler = require('./commands/chatbotCommand');

// Handle incoming messages
client.on('message', async msg => {
  console.log('Message received:', msg.body);
  
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
});

// Initialize the WhatsApp client
console.log('Starting WhatsApp client...');
client.initialize().catch(error => {
  console.error('Error initializing client:', error);
});

// Setup web server for QR code display
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

app.get('/qr.png', async (_, res) => {
  if (!lastQR) return res.status(503).send('QR code not yet generated.');
  try {
    const png = await qrcode.toBuffer(lastQR, { width: 300 });
    res.type('png').send(png);
  } catch (error) {
    res.status(500).send(`Error generating PNG: ${error.message}`);
  }
});

// Middleware to verify API key for webhooks
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

// Webhook endpoint for Home Assistant integration
app.post('/webhook/:id', express.json(), verifyWebhookApiKey, async (req, res) => {
  const webhookId = req.params.id;
  const data = req.body;
  
  console.log(`Received webhook request for: ${webhookId}`);
  
  try {
    const result = await webhooks.handleWebhook(webhookId, data);
    
    if (result.error) {
      console.error(`Webhook error (${webhookId}):`, result.message);
      res.status(400).json({ error: result.message });
    } else {
      console.log(`Webhook processed (${webhookId}):`, result);
      res.status(200).json(result);
    }
  } catch (error) {
    console.error(`Webhook execution error (${webhookId}):`, error);
    res.status(500).json({ error: error.message });
  }
});

// Available webhooks listing endpoint (useful for debugging)
app.get('/webhooks', verifyWebhookApiKey, (_, res) => {
  const webhookInfo = webhooks.getWebhooksInfo();
  res.json({ webhooks: webhookInfo });
});

// Start the web server
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`Bot server running at http://0.0.0.0:${CONFIG.PORT}/`);
  console.log(`Webhooks available at http://0.0.0.0:${CONFIG.PORT}/webhook/:id`);
});
