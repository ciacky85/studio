# Dockerfile
# Fase 1: Installazione Dipendenze e Build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Ensure lock file is copied if it exists, handle potential errors if not present
# Use npm ci if lock file exists for deterministic installs, otherwise fallback to install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Copy config files first to ensure they are available for the build context
COPY tsconfig.json next.config.ts ./
# Copy the rest of the application code
COPY . .

# Build the application
# The build process should now fail if there are underlying TypeScript or ESLint errors
# because ignoreBuildErrors and ignoreDuringBuilds were removed from next.config.ts.
# Fix any reported errors before proceeding.
RUN npm run build

# Fase 2: Immagine di Produzione
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
# It's generally safer to run as a non-root user, but comment out for now
# to simplify potential permission issues during debugging.
# USER node

# Copy necessary files from the builder stage for standalone output
COPY --from=builder /app/public ./public
# Copy the standalone directory which includes server.js and necessary node_modules
COPY --from=builder /app/.next/standalone ./
# Copy static assets generated during the build
COPY --from=builder /app/.next/static ./.next/static

# If running as USER node, uncomment the following line after COPY commands
# RUN chown -R node:node .

EXPOSE 3000

# Set port for the Node.js server inside the container
ENV PORT 3000

# Command to start the application using the standalone server script
CMD ["node", "server.js"]
