FROM oven/bun:1.2-alpine AS base

FROM base AS installer
WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

FROM installer AS builder
WORKDIR /app

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY migrations ./migrations

# Build the application
RUN bun run build

FROM oven/bun:1.2-alpine AS production

# Create app user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/node_modules ./node_modules

# Copy migrations folder for database migrations
COPY --from=builder --chown=app:app /app/migrations ./migrations

USER app

EXPOSE 3000

CMD ["bun", "run", "start"]
