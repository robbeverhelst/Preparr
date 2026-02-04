# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Runtime stage
FROM oven/bun:1-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini

# Use the existing bun user (uid 1000)

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules

# Switch to non-root user
USER bun

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["bun", "run", "dist/index.js"]