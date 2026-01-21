FROM oven/bun:latest

WORKDIR /app

RUN bun install -g everything-dev

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD bos start --account=${BOS_ACCOUNT} --domain=${GATEWAY_DOMAIN} --no-interactive
