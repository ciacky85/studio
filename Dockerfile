# Base image with Node.js
FROM node:20.9.0-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies in a separate layer
FROM base AS deps
# Install dependencies based on the preferred package manager
COPY package.json ./
# Do NOT copy package-lock.json to force regeneration
# RUN rm -f package-lock.json # Ensure no lock file exists before install
RUN npm install --legacy-peer-deps

# Build the application in a separate layer
FROM base AS builder
# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy the rest of the application code
COPY . .
# Build the Next.js application
RUN npm run build

# Production image
FROM base AS runner
# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV production
# ENV NEXT_TELEMETRY_DISABLED 1 # Uncomment to disable Next.js telemetry

# Create a non-root user
RUN addgroup --system --gid 1001 nextjs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the builder stage
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Change ownership of the config directory if it exists in the image
# This assumes the config directory might be populated later via volume mounting
RUN mkdir -p /app/config && chown -R nextjs:nextjs /app/config

# Set the user to the non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["node", "server.js"]
