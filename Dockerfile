# Stage 1: Base image with Node.js and dependencies
FROM node:20.9.0-alpine AS base
WORKDIR /app

# Copy package.json first
COPY package.json ./

# Install all dependencies (including devDependencies needed for build)
# This will generate package-lock.json if it's missing in the context
RUN npm install

# Copy the rest of the application code
COPY . .

# Stage 2: Builder stage - Build the Next.js application
FROM base AS builder
WORKDIR /app
# Ensure all code is copied before building
COPY --from=base /app /app
# Build the Next.js application
RUN npm run build

# Stage 3: Production stage - Setup the final image
FROM node:20.9.0-alpine AS production
WORKDIR /app

ENV NODE_ENV production

# Copy built artifacts from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Copy the public directory if it exists and is needed (optional for this app currently)
# COPY --from=builder /app/public ./public
# Copy standalone output files
COPY --from=builder /app/standalone ./standalone

# Expose the port the app runs on
EXPOSE 3000

# Set the entrypoint to run the standalone server
CMD ["node", "standalone/server.js"]
