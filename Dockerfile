FROM node:20-slim

# Install Chromium, networking tools, and dependencies
RUN apt-get update && apt-get install -y ffmpeg \
    chromium \
    curl \
    iputils-ping \
    netcat-openbsd \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libgtk-3-0 libnss3 xdg-utils \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create a non-root user to run the app
RUN groupadd -r whatsapp && useradd -r -g whatsapp -m whatsapp

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Create and set permissions for session and data directories
RUN mkdir -p /app/session /app/data/temp && chown -R whatsapp:whatsapp /app

# Switch to non-root user
USER whatsapp

CMD ["npm", "start"]
