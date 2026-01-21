FROM oven/bun:latest

WORKDIR /app

COPY demo/host/package.json ./
COPY demo/host/bun.lock ./

RUN bun install --frozen-lockfile

COPY demo/host/ ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
