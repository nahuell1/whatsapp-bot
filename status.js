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
      const aiProvider = process.env.AI_PROVIDER?.toLowerCase() || 'ollama';
      
      if (aiProvider === 'ollama') {
        if (!isEnvSet('OLLAMA_API_URL') || !isEnvSet('OLLAMA_MODEL')) {
          dependencies.push('Missing OLLAMA_* env vars');
          status = chalk.yellow('⚠ Check Ollama config');
        }
      } else if (aiProvider === 'openai') {
        if (!isEnvSet('OPENAI_API_KEY')) {
          dependencies.push('Missing OPENAI_API_KEY');
          status = chalk.yellow('⚠ Check OpenAI config');
        }
      } else {
        dependencies.push(`Unknown AI provider: ${aiProvider}`);
        status = chalk.yellow('⚠ Check AI_PROVIDER value');
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
  { name: 'AI_PROVIDER', description: 'AI provider to use', default: 'ollama' },
  
  // Ollama settings
  { name: 'OLLAMA_API_URL', description: 'Ollama API URL', default: 'http://localhost:11434' },
  { name: 'OLLAMA_MODEL', description: 'Ollama model name', default: 'mi-bot' },
  
  // OpenAI settings
  { name: 'OPENAI_API_KEY', description: 'OpenAI API key', default: '' },
  { name: 'OPENAI_MODEL', description: 'OpenAI model name', default: 'gpt-3.5-turbo' },
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
