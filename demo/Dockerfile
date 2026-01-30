FROM oven/bun:alpine AS builder
RUN bun install -g everything-dev@latest

FROM oven/bun:alpine
COPY --from=builder /root/.bun /root/.bun
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["sh", "-c", "bos start --account=${BOS_ACCOUNT:-every.near} --domain=${GATEWAY_DOMAIN:-everything.dev} --no-interactive"]
