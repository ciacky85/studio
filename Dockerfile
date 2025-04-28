FROM node:20.9.0-slim AS base

# Set working directory
WORKDIR /app

# Copy necessary files
COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Next.js build config
RUN npm run build

# Expose port
EXPOSE 3000

CMD ["npm", "start"]