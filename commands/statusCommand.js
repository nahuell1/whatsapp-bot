/**
 * @module commands/statusCommand
 * @description System Status Command for WhatsApp Bot
 * 
 * This module provides the !status command that shows information about
 * the bot's system status, connected services, and configuration.
 * It checks the availability of AI models and Home Assistant.
 * 
 * @requires os
 * @requires node-fetch
 */
const os = require('os');
const fetch = require('node-fetch');

/**
 * Store reference to the WhatsApp client
 * @type {Object|null}
 * @private
 */
let whatsappClient = null;

// Configuration from environment variables with multi-model support
const CONFIG = {
  // API URLs and Authentication
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // Default provider and model (used if specific ones not set)
  DEFAULT_AI_PROVIDER: process.env.DEFAULT_AI_PROVIDER || 'ollama', 
  DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Intent detection model
  INTENT_AI_PROVIDER: process.env.INTENT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  INTENT_AI_MODEL: process.env.INTENT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Chat model
  CHAT_AI_PROVIDER: process.env.CHAT_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  CHAT_AI_MODEL: process.env.CHAT_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Function model
  FUNCTION_AI_PROVIDER: process.env.FUNCTION_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || 'ollama',
  FUNCTION_AI_MODEL: process.env.FUNCTION_AI_MODEL || process.env.DEFAULT_AI_MODEL || 'mi-bot',
  
  // Home Assistant
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123'
};

/**
 * Format uptime in a human-readable way
 * 
 * @param {number} uptime - Uptime in seconds
 * @returns {string} - Formatted uptime string (e.g. "2d 5h 30m 10s")
 */
function formatUptime(uptime) {
  if (!uptime && uptime !== 0) {
    return 'unknown';
  }
  
  // Calculate time components
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  // Build parts array (only include non-zero components)
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

/**
 * Check if a service is available
 * @param {string} url - URL to check
 * @param {string} name - Service name for logging
 * @returns {Promise<boolean>} - Whether the service is available
 */
async function checkServiceAvailable(url, name) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased timeout
    
    // Use GET for Home Assistant, as it might block HEAD requests
    const method = name === 'Home Assistant' ? 'GET' : 'HEAD';
    // For Home Assistant, use a specific endpoint that's likely to work
    const targetUrl = name === 'Home Assistant' ? `${url}/api/` : url;
    
    console.log(`Checking ${name} status at ${targetUrl} using ${method}...`);
    
    const response = await fetch(targetUrl, { 
      signal: controller.signal,
      method: method
    });
    
    clearTimeout(timeoutId);
    return response.status < 500; // Consider any non-server error as "available"
  } catch (error) {
    console.log(`Error checking ${name} status:`, error.message);
    return false;
  }
}

/**
 * Get Raspberry Pi CPU temperature
 * @returns {Promise<string>} - Temperature with two decimal places or null if not available
 */
async function getRaspberryPiTemperature() {
  try {
    const { exec } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // This command works on Raspberry Pi to get CPU temperature
      exec('cat /sys/class/thermal/thermal_zone0/temp', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error getting Raspberry Pi temperature: ${error.message}`);
          resolve(null);
          return;
        }
        
        if (stderr) {
          console.error(`Temperature command error: ${stderr}`);
          resolve(null);
          return;
        }
        
        // Convert from millidegrees to degrees with two decimal places
        const tempC = (parseInt(stdout.trim()) / 1000).toFixed(2);
        resolve(tempC);
      });
    });
  } catch (error) {
    console.error('Error reading Raspberry Pi temperature:', error);
    return null;
  }
}

/**
 * Check if Home Assistant is available and get last activity info
 * @returns {Promise<object>} - Status and activity information
 */
async function getHomeAssistantStatus() {
  try {
    // Use a more reliable method based on recent successful webhook calls
    const fs = require('fs').promises;
    const path = require('path');
    const logFile = path.join(__dirname, '../webhooks/ha_activity.log');
    
    let lastActivity = null;
    let isActive = false;
    
    // Try to read the activity log file
    try {
      const stats = await fs.stat(logFile);
      const fileContent = await fs.readFile(logFile, 'utf8');
      const lastLine = fileContent.trim().split('\n').pop();
      const now = new Date();
      const fileTime = new Date(stats.mtime);
      
      // If file was modified in the last 10 minutes, consider HA as active
      const diffMinutes = (now - fileTime) / (1000 * 60);
      if (diffMinutes < 10) {
        isActive = true;
        
        // Parse the type of activity from the log file
        let activityType = 'actividad';
        if (lastLine.includes(':')) {
          // Extract everything before the first colon
          activityType = lastLine.split(':', 1)[0];
        }
        
        // Convert to local time (Argentina = UTC-3)
        const localTime = new Date(fileTime.getTime() - 3 * 60 * 60 * 1000);
        const timeStr = localTime.toLocaleTimeString('es-AR', {
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        
        lastActivity = {
          time: timeStr,
          minutesAgo: Math.round(diffMinutes),
          action: activityType
        };
        
        console.log(`Home Assistant is active - last activity: ${lastActivity.action} at ${lastActivity.time} (${lastActivity.minutesAgo} minutes ago)`);
      }
    } catch (err) {
      // File doesn't exist or can't be read, create it
      await fs.writeFile(logFile, `Home Assistant status check: ${new Date().toISOString()}\n`, 'utf8');
    }
    
    // Fall back to the standard check if needed
    if (!isActive) {
      isActive = await checkServiceAvailable(CONFIG.HOMEASSISTANT_URL, 'Home Assistant');
    }
    
    return {
      active: isActive,
      lastActivity
    };
  } catch (error) {
    console.error('Error checking Home Assistant activity:', error);
    return {
      active: false,
      lastActivity: null
    };
  }
}

/**
 * Handle status command
 * @param {object} msg - WhatsApp message object
 */
async function handleStatusCommand(msg) {
  // Start building status message
  let statusMessage = '*Bot System Status*\n\n';
  
  // System info
  const loadAvg = os.loadavg();
  const memUsed = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
  const memTotal = Math.round(os.totalmem() / 1024 / 1024);
  const memPercent = Math.round((memUsed / memTotal) * 100);
  
  // Get Raspberry Pi temperature 
  const cpuTemp = await getRaspberryPiTemperature();
  
  statusMessage += `*System:*\n`;
  statusMessage += `Platform: ${os.platform()} ${os.release()}\n`;
  statusMessage += `Uptime: ${formatUptime(os.uptime())}\n`;
  statusMessage += `Load: ${loadAvg[0].toFixed(2)}, ${loadAvg[1].toFixed(2)}, ${loadAvg[2].toFixed(2)}\n`;
  statusMessage += `Memory: ${memUsed}MB / ${memTotal}MB (${memPercent}%)\n`;
  if (cpuTemp) {
    statusMessage += `CPU Temperature: ${cpuTemp}°C\n`;
  }
  statusMessage += '\n';
  
  // Check connected services
  statusMessage += `*Services:*\n`;
  
  // Check AI services based on provider
  const providers = {
    'INTENT': CONFIG.INTENT_AI_PROVIDER,
    'CHAT': CONFIG.CHAT_AI_PROVIDER, 
    'FUNCTION': CONFIG.FUNCTION_AI_PROVIDER
  };
  
  // Check Ollama if any provider uses it
  const usesOllama = Object.values(providers).some(p => p === 'ollama') || CONFIG.DEFAULT_AI_PROVIDER === 'ollama';
  if (usesOllama && CONFIG.OLLAMA_API_URL) {
    const isAvailable = await checkServiceAvailable(CONFIG.OLLAMA_API_URL, 'Ollama');
    statusMessage += `Ollama API: ${isAvailable ? '✅ Online' : '❌ Offline'}\n`;
    statusMessage += `URL: ${CONFIG.OLLAMA_API_URL}\n`;
  }
  
  // Check OpenAI if any provider uses it
  const usesOpenAI = Object.values(providers).some(p => p === 'openai') || CONFIG.DEFAULT_AI_PROVIDER === 'openai';
  if (usesOpenAI && CONFIG.OPENAI_API_KEY) {
    // OpenAI doesn't need URL check, just show if key is configured
    statusMessage += `OpenAI API: ${CONFIG.OPENAI_API_KEY ? '✅ Key configured' : '❌ No API key'}\n`;
  }
  
  // Show model configuration
  statusMessage += `\n*AI Models:*\n`;
  statusMessage += `Intent: ${CONFIG.INTENT_AI_MODEL} (${CONFIG.INTENT_AI_PROVIDER})\n`;
  statusMessage += `Chat: ${CONFIG.CHAT_AI_MODEL} (${CONFIG.CHAT_AI_PROVIDER})\n`;
  statusMessage += `Function: ${CONFIG.FUNCTION_AI_MODEL} (${CONFIG.FUNCTION_AI_PROVIDER})\n`;
  
  // Check Home Assistant - use our more reliable method
  const homeAssistantStatus = await getHomeAssistantStatus();
  const homeAssistantAvailable = homeAssistantStatus.active;
  const lastActivity = homeAssistantStatus.lastActivity;
  statusMessage += `Home Assistant: ${homeAssistantAvailable ? '✅ Online' : '❌ Offline'}\n`;
  if (homeAssistantAvailable && lastActivity) {
    const activityText = lastActivity.action.startsWith('Home Assistant') ? 
      lastActivity.action.substring('Home Assistant'.length + 1) : lastActivity.action;
    statusMessage += `Última actividad: ${activityText} a las ${lastActivity.time} (${lastActivity.minutesAgo} min)\n`;
  }
  if (homeAssistantAvailable) {
    statusMessage += `HA URL: ${CONFIG.HOMEASSISTANT_URL}\n`;
  }
  statusMessage += '\n';
  
  // Config variables
  statusMessage += `*Config:*\n`;
  statusMessage += `HA URL: ${process.env.HOMEASSISTANT_URL || 'not set (using default)'}\n`;
  
  // Get webhook information
  const webhookHandler = require('../webhooks/webhookHandler');
  const webhooksInfo = webhookHandler.getWebhooksInfo();
  
  statusMessage += `*Webhooks:*\n`;
  webhooksInfo.forEach(webhook => {
    statusMessage += `- ${webhook.name}: ${webhook.externalId}\n`;
  });
  statusMessage += '\n';
  
  // WhatsApp connection info
  const clientInfo = whatsappClient && whatsappClient.pupBrowser ? `✅ Connected` : `❌ Disconnected`;
  statusMessage += `*WhatsApp:* ${clientInfo}`;
  
  // Send the status message
  msg.reply(statusMessage);
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!status', handleStatusCommand, 'Check bot system status and connected services');
  },
  
  // Method to set the client reference
  setClient: (client) => {
    whatsappClient = client;
  }
};
