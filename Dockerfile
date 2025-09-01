# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Runtime stage
FROM alpine:3.20

# Install runtime dependencies
RUN apk add --no-cache \
    nodejs \
    postgresql-client \
    curl \
    tini

# Create non-root user
RUN addgroup -g 1000 preparr && \
    adduser -D -u 1000 -G preparr preparr

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=preparr:preparr /app/dist ./dist
COPY --from=builder --chown=preparr:preparr /app/node_modules ./node_modules

# Switch to non-root user
USER preparr

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]