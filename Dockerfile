# Base image using Node.js 20
FROM node:20.9.0-alpine AS base

# Set up user and group
RUN addgroup --system --gid 1001 nextjs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY --chown=nextjs:nextjs package.json package-lock.json ./

# Install dependencies using npm install (generates lock file if missing)
RUN npm install

# Copy the rest of the application code
COPY --chown=nextjs:nextjs . .

# Set NEXT_TELEMETRY_DISABLED to 1 to disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Copy necessary files from the builder stage for standalone output
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Standalone mode includes the public folder in the output directory if it exists.
# Copy the public folder if it exists in the standalone output.
# Check if /app/.next/standalone/public exists before copying
# This requires running a shell command, or simply trying the copy and ignoring failure if not critical.
# A simpler approach for now is to assume it's there if needed, or remove if not used.
# If your app uses a public folder, ensure it's correctly handled by standalone output.
# COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone/public ./public

# Set the correct user and group
USER nextjs

EXPOSE 3000

ENV PORT 3000
# Set hostname to allow connections from outside the container
ENV HOSTNAME "0.0.0.0"

# server.js is created by next build in the standalone output directory
CMD ["node", "server.js"]
