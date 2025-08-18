# Use official Node.js image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Expose the port your app runs on (change if needed)
EXPOSE 3000

# Start the service
CMD ["npm", "start"]