# Use an official Node.js runtime as a parent image
# Use Node.js 20 LTS (Iron)
FROM node:20-slim AS base

# Set the working directory in the container
WORKDIR /app

# Install pnpm globally - If you prefer npm or yarn, adjust accordingly
# RUN npm install -g pnpm

# Set up environment for production by default
ENV NODE_ENV=production
# Disable Genkit telemetry unless explicitly enabled
ENV GENKIT_TELEMETRY_DISABLED=1

# --- Dependencies Stage ---
FROM base AS deps
WORKDIR /app

# Copy package.json and lock file
# Use pnpm-lock.yaml if using pnpm, package-lock.json for npm, yarn.lock for yarn
COPY package.json ./
# COPY pnpm-lock.yaml ./
COPY package-lock.json ./

# Install dependencies using pnpm (adjust if using npm or yarn)
# RUN pnpm install --frozen-lockfile --prod=false
RUN npm install --frozen-lockfile --omit=dev

# --- Builder Stage ---
FROM base AS builder
WORKDIR /app

# Copy dependencies from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js application
# If using pnpm: RUN pnpm build
# If using npm:
RUN npm run build

# --- Runner Stage ---
FROM base AS runner
WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy node_modules from the deps stage (contains only production deps)
# Ensure node_modules are copied correctly for standalone output
# The standalone output copies necessary node_modules itself,
# so copying from 'deps' might not be needed or could conflict.
# Verify if node_modules are correctly included in ./standalone/node_modules
# If not, uncomment the line below:
# COPY --from=deps /app/node_modules ./node_modules

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
# Use the Node.js server included in the standalone output
CMD ["node", "server.js"]

# Optional: Add healthcheck
# HEALTHCHECK --interval=5m --timeout=3s \
#   CMD curl -f http://localhost:3000 || exit 1
