# TODO: Migrate to prebuilt base image for faster cold starts across multiple gateways
# e.g., FROM ghcr.io/near-everything/bos-runtime:0.1.3
FROM oven/bun:alpine
WORKDIR /app

RUN bun add everything-dev@0.1.3

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["/bin/sh", "-c", "./node_modules/.bin/bos start --account $BOS_ACCOUNT --domain $GATEWAY_DOMAIN --no-interactive"]
