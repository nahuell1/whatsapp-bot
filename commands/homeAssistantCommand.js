/**
 * Home Assistant Command for WhatsApp Bot
 * Handles webhook calls to Home Assistant for area control
 */
const { safeApiRequest, formatMessage } = require('./utils');
const path = require('path');
const fs = require('fs').promises;
const webhookHandler = require('../webhooks/webhookHandler');

// Configuration from environment variables
const CONFIG = {
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123'
};

/**
 * Handle Home Assistant area control command
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments
 */
async function handleAreaCommand(msg, args) {
  // Parse arguments: !area <area_name> <on|off>
  const parts = args.toLowerCase().trim().split(/\s+/);
  
  if (parts.length !== 2) {
    msg.reply('Uso: !area <nombre_area> <on|off>');
    return;
  }
  
  const [area, turn] = parts;
  
  // Validate parameters
  if (!['office', 'room'].includes(area)) {
    msg.reply('Área no válida. Opciones disponibles: office, room');
    return;
  }
  
  if (!['on', 'off'].includes(turn)) {
    msg.reply('Estado no válido. Opciones disponibles: on, off');
    return;
  }
  
  console.log(`Processing Home Assistant area control: area=${area}, turn=${turn}`);
  
  try {
    // Find the webhook info by name
    const webhookInfo = webhookHandler.findWebhook('area_control');
    
    if (!webhookInfo) {
      msg.reply('❌ Error: No se encontró el webhook para control de áreas');
      return;
    }
    
    // Call Home Assistant webhook using the external ID
    const webhookUrl = `${CONFIG.HOMEASSISTANT_URL}/api/webhook/${webhookInfo.externalId}`;
    console.log(`Calling Home Assistant webhook at: ${webhookUrl}`);
    
    await safeApiRequest(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: area,
        turn: turn
      })
    }, 10000); // 10 second timeout
    
    // Log activity to the webhooks file for status tracking
    try {
      const logFile = path.join(__dirname, '../webhooks/ha_activity.log');
      await fs.writeFile(
        logFile,
        `Command execution: area ${area} ${turn} - ${new Date().toISOString()}\n`,
        'utf8'
      );
    } catch (err) {
      console.error('Error logging Home Assistant activity:', err);
    }
    
    msg.reply(`✅ Se ha ${turn === 'on' ? 'encendido' : 'apagado'} el área: ${area}`);
  } catch (error) {
    console.error('Error calling Home Assistant webhook:', error);
    const webhookInfo = webhookHandler.findWebhook('area_control');
    const externalId = webhookInfo ? webhookInfo.externalId : 'not found';
    msg.reply(`Error controlando el área: ${error.message}\n\nURL: ${CONFIG.HOMEASSISTANT_URL}\nWebhook ID: ${externalId}`);
  }
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!area', handleAreaCommand, 'Control Home Assistant areas: !area <area_name> <on|off>');
  }
};
