# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Add metadata labels
LABEL maintainer="Smart Milk Team"
LABEL version="1.0"
LABEL description="Users Service for Smart Milk Project"

# Set working directory
WORKDIR /app

# Install system dependencies (including build tools for bcryptjs)
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port your app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
