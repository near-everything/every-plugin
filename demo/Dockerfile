FROM oven/bun:alpine

RUN bun install -g everything-dev@latest

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["sh", "-c", "bos start --account=${BOS_ACCOUNT:-every.near} --domain=${GATEWAY_DOMAIN:-everything.dev} --no-interactive"]
