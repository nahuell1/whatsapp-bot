# WhatsApp Bot with Ollama AI Integration

A modular WhatsApp bot that connects to Ollama AI to respond to messages and can control Home Assistant devices.

## Features

- Connects to WhatsApp using whatsapp-web.js
- QR code generation for device pairing
- Integration with Ollama AI for natural language processing
- Home Assistant webhook integration for controlling areas
- Modular command system for easy extensibility
- Docker-based deployment
- Configurable via environment variables

## Prerequisites

- Docker and Docker Compose
- Ollama running and accessible
- A mobile device with WhatsApp installed

### Docker Setup

```bash
docker compose up -d
```

## Usage

The bot supports multiple commands:

### Basic Commands

- **Help Command**:
  ```
  !help
  ```
  Shows a list of all available commands and their descriptions.

- **Status Command**:
  ```
  !status
  ```
  Displays the bot's system status and connected services.

### AI Commands

- **AI Assistance**:
  ```
  !ia Tell me a joke
  ```
  The bot will process your prompt and respond with an AI-generated answer.

### Home Automation

- **Home Assistant Control**:
  ```
  !area office on
  !area room off
  ```
  Control Home Assistant areas through the configured webhook.

### Weather Information

- **Weather Command**:
  ```
  !clima Buenos Aires
  ```
  Get current weather information for a specific location.

### Notifications

- **Subscribe Command**:
  ```
  !suscribir list
  !suscribir add weather
  !suscribir remove alerts
  ```
  Manage subscriptions to notification channels.

- **Send Notifications** (admin only):
  ```
  !suscribir notify weather "Alerta de lluvia en 1 hora"
  ```
  Send a notification to all subscribers of a particular channel.

### Admin Commands

- **Restart Command** (admin only):
  ```
  !restart
  ```
  Restarts the bot (requires admin privileges).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| AI_PROVIDER | AI provider to use ('ollama' or 'openai') | ollama |
| OLLAMA_API_URL | URL of the Ollama API | http://localhost:11434 |
| OLLAMA_MODEL | Name of the Ollama model to use | mi-bot |
| OPENAI_API_KEY | OpenAI API key for using OpenAI | (empty) |
| OPENAI_MODEL | OpenAI model to use | gpt-3.5-turbo |
| OPENAI_ORG_ID | OpenAI organization ID (optional) | (empty) |
| PORT | Port for the web server | 3000 |
| COMMAND_PREFIX | Command prefix for AI commands | !ia |
| SESSION_DIR | Directory for storing session data | ./session |
| HOMEASSISTANT_URL | URL of Home Assistant instance | http://localhost:8123 |
| ADMIN_NUMBERS | Comma-separated phone numbers with admin access | (empty) |
| ENABLE_FUNCTION_CALLS | Enable or disable automatic command execution in chatbot | true |
| DEFAULT_CITY | Default city for weather command | Buenos Aires |
| DEFAULT_LATITUDE | Default latitude for weather location | 40.416775 |
| DEFAULT_LONGITUDE | Default longitude for weather location | -3.703790 |

### Webhook External IDs

The bot supports customizable external IDs for webhooks. Use these environment variables to configure them:

| Variable | Description | Default |
|----------|-------------|---------|
| AREA_CONTROL_WEBHOOK_ID | External ID for area control webhook | area_control |
| SEND_NOTIFICATION_WEBHOOK_ID | External ID for notification webhook | send_notification |
| DEVICE_CONTROL_WEBHOOK_ID | External ID for device control webhook | device_control |
| SCENE_WEBHOOK_ID | External ID for scene webhook | scene |
| SENSOR_REPORT_WEBHOOK_ID | External ID for sensor report webhook | sensor_report |

> For detailed information about webhook IDs, see [WEBHOOKS.md](WEBHOOKS.md)

## Adding New Commands

The bot uses a modular command system that makes it easy to add new functionality:

1. Create a new file in the `commands` directory (e.g., `myCommand.js`)
2. Use the following template:

```javascript
/**
 * My Custom Command for WhatsApp Bot
 */

/**
 * Handle my custom command
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments (text after the command)
 */
async function handleMyCommand(msg, args) {
  // Your command logic here
  msg.reply(`You said: ${args}`);
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!mycommand', handleMyCommand, 'Description of your command');
  }
};
```

3. The command will be automatically loaded when the bot starts - no need to modify any other files!

## Adding New Webhooks

The bot now uses a modular webhook system that makes it easy to add new webhooks for Home Assistant:

1. Create a new file in the `webhooks` directory (e.g., `myWebhook.js`)
2. Use the following template:

```javascript
/**
 * My Custom Webhook for Home Assistant
 */

/**
 * Handle my custom webhook
 * @param {object} data - Webhook data from Home Assistant
 * @returns {object} - Result of the operation
 */
async function handleMyWebhook(data) {
  // Your webhook logic here
  console.log('Received data:', data);
  
  // Do something with the data...
  
  // Return a result
  return { 
    success: true, 
    message: 'Webhook processed successfully',
    // Additional data...
  };
}

module.exports = {
  register: (webhookHandler) => {
    // Optional: Use an external ID from environment variables
    const externalId = process.env.MY_WEBHOOK_WEBHOOK_ID || null;
    
    webhookHandler.register(
      'my_webhook_id',    // Internal name used in code
      handleMyWebhook,    // Handler function 
      'Description of what this webhook does',
      externalId         // Optional external ID for the URL
    );
  }
};
```

3. The webhook will be automatically loaded when the bot starts.
4. You can call it from Home Assistant using either:
   - Internal name: `http://your-bot-host:3000/webhook/my_webhook_id`
   - External ID (if set): `http://your-bot-host:3000/webhook/your-custom-external-id`

## Project Structure

```
├── bot.js                  # Main bot application
├── commands/               # Command modules
│   ├── aiCommand.js        # AI assistant command
│   ├── commandHandler.js   # Command registration system
│   ├── helpCommand.js      # Help command
│   ├── homeAssistantCommand.js # Home Assistant integration
│   ├── index.js            # Command loader
│   ├── restartCommand.js   # Bot restart command
│   ├── statusCommand.js    # System status command
│   ├── subscribeCommand.js # Notification subscription system
│   ├── templateCommand.js  # Template for creating new commands
│   ├── utils.js           # Shared utility functions
│   └── weatherCommand.js   # Weather information command
├── webhooks/               # Webhook handlers
│   ├── areaControlWebhook.js  # Area control webhook
│   ├── index.js            # Webhook loader
│   ├── notificationWebhook.js # Notification webhook
│   ├── templateWebhook.js  # Template for creating new webhooks
│   └── webhookHandler.js   # Webhook registration system
├── data/                   # Data storage directory
│   └── subscriptions.json  # User subscription data
├── session/                # WhatsApp session data
├── restart-bot.sh          # Script to restart the bot
├── clean-session.sh        # Script to clean session data
├── status.js               # Command status utility
├── diagnose.sh             # Diagnostic script
├── .env                    # Environment configuration
├── GUIA_USUARIO.md         # Guía de usuario en español
└── package.json            # Node.js dependencies
```

## Troubleshooting

- **Permission issues**: If you encounter permission issues with the session directory, ensure Docker has the proper permissions to write to the volume.
- **Connection issues**: Make sure Ollama is running and accessible from the Docker container.
- **Scan errors**: If scanning the QR code doesn't work, try restarting the container and scanning a fresh QR code.
