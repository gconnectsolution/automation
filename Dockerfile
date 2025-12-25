# Use Node.js 24
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Expose app port (change if needed)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

