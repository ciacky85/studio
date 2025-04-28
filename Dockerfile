FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies for base image, including sharp
# Sharp needs some native dependencies, so install them here
RUN apk add --no-cache --virtual .gyp python3 make g++ && \
    npm install -g npm@latest && \
    apk del .gyp python3 make g++

# Set environment variables
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# https://nextjs.org/docs/app/building-your-application/deploying/docker#configure-the-dockerfile
# Disable turbopack for Docker builds
ENV NEXT_DISABLE_TURBOPACK=1

# Base Dependencies
FROM base AS base-deps

# Copy existing application files
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line to disable telemetry during the build process.
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm ci --omit=dev || npm install --omit=dev

# Create a separate layer for the production dependencies
FROM base AS builder

WORKDIR /app

# Copy app files
COPY . .

# Copy next.config.js if it exists

# Copy existing node_modules directory to cache node_modules (optional)
# This ensures that node_modules are cached correctly even if you haven't
# copied package-lock.json (or package.json)
COPY --from=base-deps /app/node_modules ./node_modules

# Build the Next.js application
RUN npm run build

# Production Image
FROM base AS runner

WORKDIR /app

# You can set these values in your .env file
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Install only the dependencies needed to run in production, in server mode
# Next.js needs sharp so install it now.  npm ci removes anything not in package-lock
COPY --from=builder /app/package.json ./
#Attempt to install with npm ci, if package-lock.json exists.  Otherwise, install normally.
RUN  npm ci --omit=dev || npm install --omit=dev

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
