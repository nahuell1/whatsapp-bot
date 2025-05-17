#!/bin/bash

# Script to clean up the session directory when having permission issues

echo "⚠️  WARNING: This will delete all WhatsApp session data!"
echo "You will need to scan the QR code again to connect."
echo ""
echo "Press ENTER to continue or CTRL+C to cancel..."
read

echo "Stopping WhatsApp bot container..."
docker compose down

echo "Removing session directory..."
sudo rm -rf session/

echo "Creating new session directory with proper permissions..."
mkdir -p session/
chmod 777 session/

echo "Starting WhatsApp bot container..."
docker compose up -d

echo "Done! Access the QR code at http://localhost:3000" 