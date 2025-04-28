# Base image for Node.js
FROM node:20.9.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install dependencies required for native modules, and remove temporary build packages
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package.json
COPY package.json ./

# Remove existing package-lock.json (if copied) to force regeneration
# Warning: This bypasses the lock file mechanism and is generally not recommended for reproducible builds.
RUN rm -f package-lock.json*

# Install dependencies using npm install (will generate a new package-lock.json)
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry.
# ENV NEXT_TELEMETRY_DISABLED 1

# Environment variables needed for build
ARG EMAIL_USER
ARG EMAIL_PASS
ARG GOOGLE_GENAI_API_KEY
ENV EMAIL_USER=${EMAIL_USER}
ENV EMAIL_PASS=${EMAIL_PASS}
ENV GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY}
ENV NEXT_PUBLIC_EMAIL_USER=${EMAIL_USER} # Example if needed client-side

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set the correct permission for prerender cache - ensure directory exists first
RUN mkdir -p .next && chown nextjs:nodejs .next

USER nextjs

EXPOSE 3000

ENV PORT 3000
# SERVER_BASE_PATH environment variable is automatically set by Next.js to the output directory
# CMD ["node", "server.js"] # This command is correct for standalone output
CMD ["node", "standalone/server.js"] # Updated path for standalone output
