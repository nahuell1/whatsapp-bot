#!/usr/bin/env node

/**
 * Command Status Script for WhatsApp Bot
 * Shows a summary of registered commands and their dependencies
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const chalk = require('chalk');

// Load environment variables
dotenv.config();

// Directory with commands
const commandsDir = path.join(__dirname, 'commands');

// Check if a package is installed
function isPackageInstalled(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch (e) {
    return false;
  }
}

// Check if chalk is installed, if not, install it
if (!isPackageInstalled('chalk')) {
  console.log('Installing chalk package for colored output...');
  require('child_process').execSync('npm install chalk', {
    stdio: 'inherit'
  });
  console.log('Chalk installed successfully.');
}

// Check if an environment variable is set
function isEnvSet(varName) {
  return process.env[varName] !== undefined && process.env[varName] !== '';
}

console.log(chalk.bold.blue('\nWhatsApp Bot Command Status\n'));

// Get all command files
const commandFiles = fs.readdirSync(commandsDir)
  .filter(file => 
    file.endsWith('.js') && 
    !file.startsWith('template') &&
    file !== 'commandHandler.js' &&
    file !== 'utils.js' &&
    file !== 'index.js'
  );

// Command status table
console.log(chalk.bold('Available Commands:'));
console.log('-'.repeat(80));
console.log(
  chalk.bold('Command'.padEnd(20)) + 
  chalk.bold('File'.padEnd(25)) +
  chalk.bold('Status'.padEnd(15)) +
  chalk.bold('Dependencies')
);
console.log('-'.repeat(80));

// Process each command file
commandFiles.forEach(file => {
  try {
    const filePath = path.join(commandsDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Extract command name (this is a simple heuristic, not foolproof)
    const commandMatch = fileContent.match(/commandHandler\.register\(['"](.+?)['"],/);
    const commandName = commandMatch ? commandMatch[1] : '?';
    
    // Determine dependencies
    const dependencies = [];
    let status = chalk.green('✓ Ready');
    
    // Check for specific dependencies
    if (file === 'aiCommand.js' || file === 'chatbotCommand.js') {
      // Get the default provider for checking
      const defaultProvider = process.env.DEFAULT_AI_PROVIDER?.toLowerCase() || 'ollama';
      
      // Check all potential providers that might be used
      const providers = new Set([
        defaultProvider,
        process.env.INTENT_AI_PROVIDER?.toLowerCase() || defaultProvider,
        process.env.CHAT_AI_PROVIDER?.toLowerCase() || defaultProvider,
        process.env.FUNCTION_AI_PROVIDER?.toLowerCase() || defaultProvider
      ]);
      
      // Check dependencies for each configured provider
      if (providers.has('ollama') && !isEnvSet('OLLAMA_API_URL')) {
        dependencies.push('Missing OLLAMA_API_URL');
        status = chalk.yellow('⚠ Check Ollama config');
      }
      
      if (providers.has('openai') && !isEnvSet('OPENAI_API_KEY')) {
        dependencies.push('Missing OPENAI_API_KEY');
        status = chalk.yellow('⚠ Check OpenAI config');
      }
      
      // Check if any unknown providers are configured
      const unknownProviders = [...providers].filter(p => !['ollama', 'openai'].includes(p));
      if (unknownProviders.length > 0) {
        dependencies.push(`Unknown provider(s): ${unknownProviders.join(', ')}`);
        status = chalk.yellow('⚠ Check AI provider settings');
      }
    }
    
    if (file === 'homeAssistantCommand.js') {
      if (!isEnvSet('HOMEASSISTANT_URL') || (!isEnvSet('AREA_CONTROL_WEBHOOK_ID') && !isEnvSet('WEBHOOK_ID'))) {
        dependencies.push('Missing HOMEASSISTANT_* env vars');
        status = chalk.yellow('⚠ Check config');
      }
    }
    
    if (file === 'weatherCommand.js') {
      // Open-Meteo API doesn't require an API key
      // Just check if default location is set
      if (!isEnvSet('DEFAULT_LATITUDE') || !isEnvSet('DEFAULT_LONGITUDE')) {
        dependencies.push('Missing default location');
        status = chalk.yellow('⚠ Using Buenos Aires as default');
      }
    }
    
    if (file === 'restartCommand.js') {
      if (!isEnvSet('ADMIN_NUMBERS')) {
        dependencies.push('ADMIN_NUMBERS not set');
        status = chalk.yellow('⚠ No admins defined');
      }
    }
    
    console.log(
      commandName.padEnd(20) +
      file.padEnd(25) +
      status.padEnd(30) +
      (dependencies.length ? dependencies.join(', ') : '-')
    );
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
});

console.log('-'.repeat(80));
console.log('\nEnvironment Status:');
console.log('-'.repeat(80));

// Check environment variables
const envVars = [
  // Default AI Provider and Model
  { name: 'DEFAULT_AI_PROVIDER', description: 'Default AI provider to use', default: 'ollama' },
  { name: 'DEFAULT_AI_MODEL', description: 'Default AI model name', default: 'mi-bot' },
  
  // Intent Detection Model
  { name: 'INTENT_AI_PROVIDER', description: 'AI provider for intent detection', default: 'DEFAULT_AI_PROVIDER' },
  { name: 'INTENT_AI_MODEL', description: 'Model for intent detection', default: 'DEFAULT_AI_MODEL' },
  
  // Chat Model
  { name: 'CHAT_AI_PROVIDER', description: 'AI provider for chat conversations', default: 'DEFAULT_AI_PROVIDER' },
  { name: 'CHAT_AI_MODEL', description: 'Model for chat conversations', default: 'DEFAULT_AI_MODEL' },
  
  // Function Model
  { name: 'FUNCTION_AI_PROVIDER', description: 'AI provider for function execution', default: 'DEFAULT_AI_PROVIDER' },
  { name: 'FUNCTION_AI_MODEL', description: 'Model for function execution', default: 'DEFAULT_AI_MODEL' },
  
  // Ollama settings
  { name: 'OLLAMA_API_URL', description: 'Ollama API URL', default: 'http://localhost:11434' },
  
  // OpenAI settings
  { name: 'OPENAI_API_KEY', description: 'OpenAI API key', default: '' },
  { name: 'OPENAI_ORG_ID', description: 'OpenAI Organization ID', default: '' },
  { name: 'HOMEASSISTANT_URL', description: 'Home Assistant URL', default: 'http://localhost:8123' },
  { name: 'AREA_CONTROL_WEBHOOK_ID', description: 'Home Assistant area control webhook ID', default: 'area_control' },
  { name: 'ADMIN_NUMBERS', description: 'Admin phone numbers', default: null },
  { name: 'DEFAULT_CITY', description: 'Default city for weather', default: 'Buenos Aires' },
  { name: 'DEFAULT_LATITUDE', description: 'Default latitude for weather', default: '40.416775' },
  { name: 'DEFAULT_LONGITUDE', description: 'Default longitude for weather', default: '-3.703790' }
];

envVars.forEach(v => {
  const isSet = isEnvSet(v.name);
  const status = isSet ? 
    chalk.green('✓ Set') : 
    (v.required ? chalk.red('✗ Missing') : chalk.yellow('⚠ Using default'));
  
  console.log(
    v.name.padEnd(25) +
    status.padEnd(15) +
    (v.description + (v.default && !isSet ? ` (default: ${v.default})` : ''))
  );
});

console.log('-'.repeat(80));
console.log(`\nRun ${chalk.cyan('node bot.js')} to start the WhatsApp bot.\n`);
