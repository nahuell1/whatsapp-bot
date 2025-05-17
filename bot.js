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
  COMMAND_PREFIX: process.env.COMMAND_PREFIX || '!ia'
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
});

client.on('loading_screen', (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

client.on('disconnected', reason => {
  console.warn('❌ Disconnected:', reason);
  lastQR = null;
});

// Handle incoming messages
client.on('message', async msg => {
  console.log('Message received:', msg.body);
  
  // Only process messages starting with the command prefix
  if (msg.body.startsWith(CONFIG.COMMAND_PREFIX)) {
    const prompt = msg.body.slice(CONFIG.COMMAND_PREFIX.length).trim();
    
    if (!prompt) {
      msg.reply('Por favor, enviá un mensaje después del comando !ia');
      return;
    }
    
    console.log('Processing AI prompt:', prompt);
    
    try {
      // Call Ollama API
      const response = await fetch(`${CONFIG.OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.OLLAMA_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama responded with status ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      console.log('AI response received successfully');
      
      // Extract the response content based on Ollama's response format
      const aiResponse = data.message?.content || data.response || 'No clear response from AI';
      msg.reply(aiResponse);
    } catch (error) {
      console.error('Error calling Ollama:', error);
      msg.reply(`Error connecting to AI: ${error.message}`);
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

// Start the web server
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`QR code server running at http://0.0.0.0:${CONFIG.PORT}/`);
});
