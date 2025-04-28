# Stage 1: Build the Next.js application
FROM node:20.9.0-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json AND package-lock.json
COPY package.json ./
# Make sure package-lock.json is copied BEFORE running npm ci
COPY package-lock.json ./

# Install dependencies using npm ci for faster, more reliable builds based on lock file
# This requires package-lock.json to be present
RUN npm ci

# Copy the rest of the application code
COPY . .

# Set environment variables (optional, can be overridden at runtime)
# ENV NODE_ENV=production
# ENV EMAIL_USER=your_email@example.com
# ENV EMAIL_PASS=your_password

# Build the Next.js application
RUN npm run build

# Stage 2: Create the production image
FROM node:20.9.0-alpine

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV production

# Copy built assets from the builder stage
# Copy the standalone Next.js output
COPY --from=builder /app/.next/standalone ./
# Copy the static assets (if any)
COPY --from=builder /app/.next/static ./.next/static
# Copy the public directory (if it exists and is needed)
# COPY --from=builder /app/public ./public

# Expose the port the app runs on (default 3000 for production start)
EXPOSE 3000

# Command to run the application
CMD ["node", "server.js"]
