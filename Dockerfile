# ==========================================
# Dockerfile - Ordonnance Direct Production
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring optional native canvas for production if needed)
RUN npm ci --legacy-peer-deps

# Copy source files
COPY . .

# Build Vite frontend & Node server bundle
RUN npm run build

# ==========================================
# Runner Stage
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies for alpine
RUN apk add --no-cache libc6-compat

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Expose container port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.js"]
