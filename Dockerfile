FROM node:20.9.0-alpine AS base
# Set working directory
WORKDIR /app

# Copy essential files
COPY package.json .
COPY package-lock.json .

# Install dependencies to generate the lockfile
RUN npm install

# If you are using yarn, uncomment the following lines
# COPY yarn.lock .
# RUN yarn install

# Set environment variables
ENV NODE_ENV production

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

FROM base AS builder

# Copy application source code
COPY . .

# Install dependencies for production
RUN npm install --omit=dev

# Build the Next.js application
RUN npm run build

FROM node:20.9.0-alpine AS production

# Set working directory
WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

# Install only production dependencies
RUN npm install --omit=dev

# Expose the port that Next.js will be running on
EXPOSE 3000

# Start the Next.js server
CMD ["npm", "start"]
