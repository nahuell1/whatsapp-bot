/**
 * @module commands/homeAssistantCommand
 * @description Home Assistant command implementation for the WhatsApp bot
 * 
 * This module provides commands that interact with Home Assistant smart home
 * system. It enables users to control areas, devices, and query states through
 * the WhatsApp interface using webhook calls.
 * 
 * @requires ./utils
 * @requires path
 * @requires fs.promises
 * @requires ../webhooks/webhookHandler
 */
const { safeApiRequest, formatMessage } = require('./utils');
const path = require('path');
const fs = require('fs').promises;
const webhookHandler = require('../webhooks/webhookHandler');

/**
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  /**
   * URL for the Home Assistant instance
   * @type {string}
   */
  HOMEASSISTANT_URL: process.env.HOMEASSISTANT_URL || 'http://localhost:8123'
};

/**
 * Handle Home Assistant area control command
 * Parses command arguments and calls the area control webhook
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} args - Command arguments in format "<area_name> <on|off>"
 * @returns {Promise<void>}
 */
async function handleAreaCommand(msg, args) {
  try {
    // Parse arguments: !area <area_name> <on|off>
    const parts = args.toLowerCase().trim().split(/\s+/);
    
    // Validate argument count
    if (parts.length !== 2) {
      await msg.reply(formatMessage({
        title: '⚠️ Formato incorrecto',
        body: 'Uso: !area <nombre_area> <on|off>',
        footer: 'Ejemplo: !area office on'
      }));
      return;
    }
    
    const [area, turn] = parts;
    
    // Validate area parameter
    if (!['office', 'room'].includes(area)) {
      await msg.reply(formatMessage({
        title: '⚠️ Área no válida',
        body: 'Áreas disponibles: office, room'
      }));
      return;
    }
  
    // Validate state parameter
    if (!['on', 'off'].includes(turn)) {
      await msg.reply(formatMessage({
        title: '⚠️ Estado no válido',
        body: 'Estados disponibles: on, off'
      }));
      return;
    }
  
    console.log(`Processing Home Assistant area control: area=${area}, turn=${turn}`);
  
    try {
      // Find the webhook info by name
      const webhookInfo = webhookHandler.findWebhook('area_control');
      
      if (!webhookInfo) {
        await msg.reply(formatMessage({
          title: '❌ Error de configuración',
          body: 'No se encontró el webhook para control de áreas'
        }));
        return;
      }
      
      // Call Home Assistant webhook using the external ID
      const webhookUrl = `${CONFIG.HOMEASSISTANT_URL}/api/webhook/${webhookInfo.externalId}`;
      console.log(`Calling Home Assistant webhook at: ${webhookUrl}`);
      
      // Send the webhook request
      await safeApiRequest(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: area,
          turn: turn
        })
      }, 10000); // 10 second timeout
      
      // Log activity to the webhooks file for status tracking
      await logAreaActivity(area, turn);
      
      // Send confirmation message
      const responseMessage = formatMessage({
        title: '✅ Acción completada',
        body: `Se ha ${turn === 'on' ? 'encendido' : 'apagado'} el área: ${area}`
      });
      
      await msg.reply(responseMessage);
    } catch (error) {
      // Handle errors
      console.error('Error calling Home Assistant webhook:', error);
      
      // Get diagnostic information
      const webhookInfo = webhookHandler.findWebhook('area_control');
      const externalId = webhookInfo ? webhookInfo.externalId : 'no encontrado';
      
      // Send error message with diagnostic details
      await msg.reply(formatMessage({
        title: '❌ Error',
        body: `Error controlando el área: ${error.message}`,
        footer: `URL: ${CONFIG.HOMEASSISTANT_URL}\nWebhook ID: ${externalId}`
      }));
    }
  } catch (error) {
    console.error('Error processing area command:', error);
    await msg.reply('❌ Error procesando el comando: ' + error.message);
  }
}

/**
 * Log area control activity to the activity log file
 * 
 * @async
 * @param {string} area - The area being controlled
 * @param {string} turn - The state being set (on/off)
 * @private
 */
async function logAreaActivity(area, turn) {
  try {
    const logFile = path.join(__dirname, '../webhooks/ha_activity.log');
    const logEntry = `Command execution: area ${area} ${turn} - ${new Date().toISOString()}\n`;
    
    // Append to the log file
    await fs.appendFile(logFile, logEntry, 'utf8');
  } catch (err) {
    console.error('Error logging Home Assistant activity:', err);
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
    commandHandler.register(
      '!area', 
      handleAreaCommand, 
      'Control Home Assistant areas: !area <area_name> <on|off>'
    );
  }
};
