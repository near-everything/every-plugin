# Docs Book Demo

A minimal documentation site demonstrating everything-dev-next.

## Structure

```
docs-book/
├── bos.config.json    # App configuration
├── host/              # Host server (orchestrator)
├── ui/                # UI remote (TanStack Router)
├── api/               # API plugin remote (oRPC)
└── e2e/               # Playwright tests
```

## Quick Start

```bash
# Install dependencies
bun install

# Build everything-dev-next
cd ../../packages/everything-dev-next
bun run build
cd ../../demo-next/docs-book

# Start all services (in separate terminals)
cd api && npm run dev    # Port 3014
cd ui && npm run dev     # Port 3002
cd host && npm run dev   # Port 3000
```

## API Endpoints

- `GET /api/rpc/docs` - List all docs
- `GET /api/rpc/docs/{slug}` - Get doc by slug

## UI Routes

- `/` - Docs list
- `/docs/{slug}` - Doc page

## E2E Tests

```bash
cd e2e
npm install
npm test
```

## Remote-Only Mode

To run the host with remote UI and API (no local builds):

1. Deploy UI and API to their production URLs
2. Update `bos.config.json` with production URLs
3. Run `npm run start` in host/

The host will load UI and API via their `mf-manifest.json` entries.
