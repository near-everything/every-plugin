FROM oven/bun:alpine

WORKDIR /app

RUN bun install -g everything-dev

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["sh", "-c", "if [ \"$DEBUG\" = \"true\" ]; then echo '[DEBUG] Keep-alive mode - container will stay running for inspection'; tail -f /dev/null; else bos start --account=${BOS_ACCOUNT} --domain=${GATEWAY_DOMAIN} --no-interactive; fi"]
