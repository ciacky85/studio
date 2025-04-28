FROM node:20.9.0-slim AS base

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json .
COPY package-lock.json .

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the app
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
