# WhatsApp Bot with Ollama AI Integration

A WhatsApp bot that connects to Ollama AI to respond to messages.

## Features

- Connects to WhatsApp using whatsapp-web.js
- QR code generation for device pairing
- Integration with Ollama AI for natural language processing
- Docker-based deployment
- Configurable via environment variables

## Prerequisites

- Docker and Docker Compose
- Ollama running and accessible
- A mobile device with WhatsApp installed

## Setup

1. Clone this repository
2. Create a `.env` file based on `.env.example`
3. Customize the environment variables as needed
4. Start the bot:

```bash
docker compose up -d
```

5. Access the QR code at `http://localhost:3000`
6. Scan the QR code with WhatsApp on your mobile device

## Usage

Send messages to the bot using the command prefix (default: `!ia`):

```
!ia Tell me a joke
```

The bot will process your prompt and respond with an AI-generated answer.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| OLLAMA_API_URL | URL of the Ollama API | http://localhost:11434 |
| OLLAMA_MODEL | Name of the Ollama model to use | mi-bot |
| PORT | Port for the web server | 3000 |
| COMMAND_PREFIX | Command prefix for AI commands | !ia |
| SESSION_DIR | Directory for storing session data | ./session |

## Troubleshooting

- **Permission issues**: If you encounter permission issues with the session directory, ensure Docker has the proper permissions to write to the volume.
- **Connection issues**: Make sure Ollama is running and accessible from the Docker container.
- **Scan errors**: If scanning the QR code doesn't work, try restarting the container and scanning a fresh QR code.

## License

ISC 