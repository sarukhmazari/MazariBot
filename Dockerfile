# Use Node.js LTS image (slim version to keep the image lightweight)
FROM node:20-slim

# Install system dependencies for Baileys, media editing, and sticker processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libwebp-dev \
    imagemagick \
    graphicsmagick \
    build-essential \
    ca-certificates \
    openssl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Set default environment variables for Hugging Face Spaces
ENV ADMIN_PORT=7860
ENV SKIP_PROMPT=true
ENV NODE_ENV=production

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Start the bot using the standard start command
CMD ["npm", "start"]
