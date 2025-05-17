/**
 * Settings Command for WhatsApp Bot
 * Allows users to configure bot settings
 */

// Store settings in memory
const settings = {
  enableFunctionCalls: process.env.ENABLE_FUNCTION_CALLS !== 'false' // Enabled by default
};

/**
 * Handle settings command
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments
 */
async function handleSettingsCommand(msg, args) {
  // Split args into setting and value
  const parts = args.trim().split(/\s+/);
  
  // If no arguments, show current settings
  if (!args.trim()) {
    const settingsMessage = `*Configuración actual:*\n\n` +
      `Ejecución automática de comandos: ${settings.enableFunctionCalls ? '✅ Activada' : '❌ Desactivada'}\n\n` +
      `Para cambiar la configuración, usa:\n` +
      `!settings funciones on/off`;
    
    msg.reply(settingsMessage);
    return;
  }
  
  // Parse command
  const setting = parts[0].toLowerCase();
  const value = parts.length > 1 ? parts[1].toLowerCase() : null;
  
  // Handle different settings
  if (setting === 'funciones' || setting === 'func' || setting === 'commands') {
    if (!value || !['on', 'off'].includes(value)) {
      msg.reply('Valor no válido. Usa "on" para activar o "off" para desactivar.');
      return;
    }
    
    settings.enableFunctionCalls = value === 'on';
    
    // Update environment variable for other modules
    process.env.ENABLE_FUNCTION_CALLS = settings.enableFunctionCalls.toString();
    
    msg.reply(`✅ Ejecución automática de comandos: ${settings.enableFunctionCalls ? 'Activada' : 'Desactivada'}`);
    return;
  }
  
  // Unknown setting
  msg.reply(`Configuración no reconocida: ${setting}`);
}

/**
 * Get current settings
 * @returns {object} - Current settings
 */
function getSettings() {
  return { ...settings };
}

module.exports = {
  handleSettingsCommand,
  getSettings,
  register: (commandHandler) => {
    commandHandler.register('!settings', handleSettingsCommand, 'Configurar ajustes del bot: !settings [funciones on/off]');
  }
};
