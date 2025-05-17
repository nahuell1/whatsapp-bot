#!/bin/bash
# Restart script for the WhatsApp bot

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if running with PM2
if command -v pm2 >/dev/null 2>&1; then
    echo "Restarting bot with PM2..."
    pm2 restart whatsapp-bot || pm2 restart all
else
    echo "PM2 not found, trying to restart directly..."
    
    # Kill the current process (this should be run in a separate process)
    pkill -f "node.*bot.js" || true
    
    # Wait for process to exit
    sleep 2
    
    # Start the bot again
    cd "$SCRIPT_DIR" && npm start &
    
    echo "Bot restart initiated."
fi
