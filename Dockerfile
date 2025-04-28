# Stage 1: Builder
# Use a specific Node.js version compatible with the project
FROM node:20.9.0-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock if used)
# Ensure package-lock.json exists or run `npm install` locally first to generate it
COPY package.json package-lock.json* ./
# If using yarn:
# COPY package.json yarn.lock ./

# Install dependencies using npm ci for faster, more reliable builds from lock file
# If package-lock.json wasn't present, Docker will create it here if not ignored
RUN npm ci
# If using yarn:
# RUN yarn install --frozen-lockfile

# Copy the rest of the application code
# Ensure .dockerignore doesn't exclude necessary source files (like src)
COPY . .

# Set environment variable for Next.js build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Build the Next.js application
# This assumes your build script is defined in package.json
RUN npm run build

# Stage 2: Production Runner
# Use a lightweight Node.js image for the production environment
FROM node:20.9.0-alpine AS runner

# Set the working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the builder stage
# Copy only the production build artifacts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Public directory is often needed for static assets like images
# Check if your app uses a public directory and uncomment if needed
# COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to the non-root user
USER nextjs

# Expose the port the app runs on (default Next.js port is 3000)
EXPOSE 3000

# Set the default command to run the application
# Use the node server directly for standalone output
# Ensure the path to server.js is correct for standalone output
CMD ["node", "server.js"]
