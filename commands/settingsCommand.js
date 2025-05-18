/**
 * @module commands/settingsCommand
 * @description Settings command implementation for the WhatsApp bot
 * 
 * This module provides the !settings command that lets users configure
 * various bot settings and behaviors. Settings are stored in memory
 * and can be accessed by other modules.
 */

/**
 * In-memory store for settings
 * @type {Object}
 * @private
 */
const settings = {
  /**
   * Whether function calls are enabled for automatic command execution
   * @type {boolean}
   */
  enableFunctionCalls: process.env.ENABLE_FUNCTION_CALLS !== 'false' // Enabled by default
};

/**
 * Handle settings command requests
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {string} args - Command arguments (setting and value)
 * @returns {Promise<void>}
 */
async function handleSettingsCommand(msg, args) {
  try {
    // Split args into setting and value
    const parts = args.trim().split(/\s+/);
    
    // If no arguments, show current settings
    if (!args.trim()) {
      return displayCurrentSettings(msg);
    }
    
    // Parse command parts
    const setting = parts[0].toLowerCase();
    const value = parts.length > 1 ? parts[1].toLowerCase() : null;
    
    // Handle different settings
    if (['funciones', 'func', 'commands'].includes(setting)) {
      return handleFunctionCallSetting(msg, value);
    }
    
    // Unknown setting
    await msg.reply(`⚠️ Configuración no reconocida: ${setting}\nUsa !settings sin argumentos para ver las opciones disponibles.`);
  } catch (error) {
    console.error('Error in settings command:', error);
    await msg.reply('Error al procesar la configuración: ' + error.message);
  }
}

/**
 * Display the current settings to the user
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @returns {Promise<void>}
 * @private
 */
async function displayCurrentSettings(msg) {
  const settingsMessage = `*Configuración actual:*\n\n` +
    `Ejecución automática de comandos: ${settings.enableFunctionCalls ? '✅ Activada' : '❌ Desactivada'}\n\n` +
    `Para cambiar la configuración, usa:\n` +
    `!settings funciones on/off`;
  
  await msg.reply(settingsMessage);
}

/**
 * Handle function call setting changes
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {string|null} value - The new value (on/off)
 * @returns {Promise<void>}
 * @private
 */
async function handleFunctionCallSetting(msg, value) {
  // Validate input
  if (!value || !['on', 'off'].includes(value)) {
    await msg.reply('⚠️ Valor no válido. Usa "on" para activar o "off" para desactivar.');
    return;
  }
  
  // Update setting
  settings.enableFunctionCalls = value === 'on';
  
  // Update environment variable for other modules
  process.env.ENABLE_FUNCTION_CALLS = settings.enableFunctionCalls.toString();
  
  // Confirm the change
  await msg.reply(`✅ Ejecución automática de comandos: ${settings.enableFunctionCalls ? 'Activada' : 'Desactivada'}`);
  
  // Log the setting change
  console.log(`Setting changed: enableFunctionCalls = ${settings.enableFunctionCalls}`);
}

/**
 * Get current settings as a read-only copy
 * 
 * @returns {Object} - Current settings object (copy)
 */
function getSettings() {
  return { ...settings };
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Handler for the settings command
   */
  handleSettingsCommand,
  
  /**
   * Get current settings
   * @returns {Object} - Current settings
   */
  getSettings,
  
  /**
   * Register this command with the command handler
   * 
   * @param {Object} commandHandler - Command handler instance
   */
  register: (commandHandler) => {
    commandHandler.register(
      '!settings', 
      handleSettingsCommand, 
      'Configurar ajustes del bot: !settings [funciones on/off]'
    );
  }
};
