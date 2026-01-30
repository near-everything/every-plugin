FROM oven/bun:alpine

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY */package.json ./*/

RUN bun install --frozen-lockfile --production

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["sh", "-c", "bos start --account=${BOS_ACCOUNT:-every.near} --domain=${GATEWAY_DOMAIN:-everything.dev} --no-interactive"]
