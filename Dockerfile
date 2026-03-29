# CogniMesh v5.0 - Production Dockerfile
# Multi-stage build optimized for production deployment

# ============================================================
# Stage 1: Dependencies
# ============================================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci && npm cache clean --force

# ============================================================
# Stage 2: Builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create production build (if applicable)
RUN npm run build -- --skip-lint 2>/dev/null || echo "No build step required"

# ============================================================
# Stage 3: Production
# ============================================================
FROM node:20-alpine AS production

LABEL maintainer="CogniMesh Systems <dev@cognimesh.io>"
LABEL version="5.0.0"
LABEL description="CogniMesh MCP Server - Multi-agent AI orchestration platform"

# Install runtime dependencies
RUN apk add --no-cache sqlite curl ca-certificates tzdata \
    && rm -rf /var/cache/apk/*

# Set timezone
ENV TZ=UTC

# Create non-root user
RUN addgroup -g 1001 -S cognimesh && \
    adduser -S cognimesh -u 1001 -G cognimesh

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application files
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package*.json ./

# Create required directories with proper permissions
RUN mkdir -p data cache logs backups && \
    chown -R cognimesh:cognimesh /app

# Switch to non-root user
USER cognimesh

# Expose ports
# 3000 - HTTP API
# 3001 - Dashboard
# 8080 - WebSocket (if enabled)
EXPOSE 3000 3001 8080

# Environment configuration
ENV NODE_ENV=production \
    COGNIMESH_PORT=3000 \
    COGNIMESH_HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/cognimesh.db \
    COGNIMESH_DATA_DIR=/app/data \
    COGNIMESH_CACHE_DIR=/app/cache \
    COGNIMESH_LOGS_DIR=/app/logs \
    LOG_LEVEL=info

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fs http://localhost:3000/health/live || exit 1

# Graceful shutdown handling
STOPSIGNAL SIGTERM

# Entry point
CMD ["node", "src/server.js"]
