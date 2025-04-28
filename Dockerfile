# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json ./
COPY package-lock.json ./
# If you use yarn, copy yarn.lock instead:
# COPY yarn.lock ./

# Install dependencies
RUN npm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Set build-time arguments for environment variables needed during build
# These won't be directly used in the build but shows the pattern if needed
ARG GOOGLE_GENAI_API_KEY
ARG EMAIL_USER
ARG EMAIL_PASS

# Set environment variables for the build process (if needed by build)
# Note: These are generally NOT needed for Next.js build unless specifically used in getStaticProps/Paths without runtime access
# ENV GOOGLE_GENAI_API_KEY=$GOOGLE_GENAI_API_KEY
# ENV EMAIL_USER=$EMAIL_USER
# ENV EMAIL_PASS=$EMAIL_PASS

# Build the Next.js application
# The build automatically includes server components and optimizes the app
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Set environment variables required at runtime
# Use ARG to allow overriding during build, but primarily set via ENV for runtime
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG GOOGLE_GENAI_API_KEY
ENV GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY}

ARG EMAIL_USER
ENV EMAIL_USER=${EMAIL_USER}

ARG EMAIL_PASS
ENV EMAIL_PASS=${EMAIL_PASS}

# Optionally set the port, default is 3000 for `next start`
ARG PORT=3000
ENV PORT=${PORT}

# Install necessary production packages (e.g., sharp for next/image)
# RUN apk add --no-cache libc6-compat
# RUN npm install --production sharp # Or install directly if needed

# Copy built application from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Expose the port the app runs on
EXPOSE ${PORT}

# Command to run the application
# Use the standard `next start` which relies on the build output
CMD ["npm", "start"]
