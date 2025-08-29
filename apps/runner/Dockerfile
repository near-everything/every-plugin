FROM oven/bun:1.2-alpine AS base

FROM base AS installer
WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages
COPY apps ./apps

RUN bun install

FROM installer AS builder
WORKDIR /app

# Build packages in correct dependency order
RUN cd packages/shared-types && bun run build

RUN cd packages/shared-db && bun run build

RUN cd packages/shared-queue && bun run build

# Build the job-scheduler
RUN cd apps/job-scheduler && bun run build

FROM oven/bun:1.2-alpine AS production

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder --chown=app:app /app/apps/job-scheduler/dist ./dist
COPY --from=builder --chown=app:app /app/apps/job-scheduler/package.json ./package.json
COPY --from=builder --chown=app:app /app/node_modules ./node_modules

USER app

CMD ["bun", "run", "start"]
