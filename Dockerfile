# Use an official Node.js runtime as a parent image
# Use a specific Node.js version compatible with the project
FROM node:20.9.0-alpine AS base

# Set the working directory in the container
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
# Copy package.json first
COPY package.json ./
# Install dependencies using npm install (will generate package-lock.json if missing)
RUN npm install

# Stage 2: Build the Next.js application
FROM base AS builder
# Set the working directory
WORKDIR /app
# Copy dependencies from the previous stage
COPY --from=deps /app/node_modules ./node_modules
# Copy the rest of the application code
COPY . .
# Build the Next.js application
RUN npm run build

# Stage 3: Production image
FROM base AS runner
# Set the working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
# Optionally, expose the port Next.js runs on (default is 3000)
# EXPOSE 3000 (handled by docker-compose or docker run)

# Copy the built Next.js app from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# The command to run the application
# Use the hostname '0.0.0.0' to accept connections from any IP address
CMD ["node", "server.js"]
