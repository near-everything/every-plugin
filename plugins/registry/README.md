# Registry Plugin

FastFS Registry plugin for managing NEAR plugin deployments. Acts as a Relayer for meta-transactions, allowing CI/CD systems to publish plugin updates without holding gas funds.

## Features

- **Relayer Service**: Accepts signed delegate actions and submits them to NEAR
- **Registry SDK**: Functions for creating and managing registry updates
- **FastFS Integration**: Stores registry data on-chain via FastFS

## Installation

```bash
bun install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
NEAR_NETWORK=testnet
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
```

## API Endpoints

### POST /publish

Relays a signed delegate action to update the registry.

**Request:**
```json
{
  "payload": "base64-encoded-signed-delegate-action"
}
```

**Response:**
```json
{
  "hash": "transaction-hash"
}
```

### GET /ping

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Usage as SDK

The plugin exports all registry management functions:

```typescript
import { 
  createUpdateDelegateAction,
  publishPluginUpdate,
  fetchRegistry,
  type RegistryConfig,
  type RegistryItem
} from "@data-provider/registry";
import { Near } from "near-kit";

// Create delegate action (for CI/CD)
const near = new Near({
  network: "testnet",
  privateKey: process.env.NEAR_PRIVATE_KEY,
  defaultSignerId: "publisher.testnet"
});

const config: RegistryConfig = {
  accountId: "registry.testnet",
  contractId: "fastfs.near",
  relativePath: "registry.json"
};

const update: RegistryItem = {
  name: "@data-provider/my-plugin",
  type: "registry:plugin",
  url: "https://cdn.example.com/plugin.js",
  version: "1.0.0"
};

// Create delegate action
const { payload } = await createUpdateDelegateAction(near, config, update);

// Send to relayer
await fetch("https://registry-api.example.com/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payload })
});
```

## Development

```bash
# Start dev server
bun run dev

# Build
bun run build

# Type check
bun run type-check

# Test
bun run test
```

## Architecture

The plugin uses the Delegate Action (NEP-366) pattern:

1. **Client**: Signs a transaction update but doesn't submit it
2. **Relayer**: Receives the signed action and submits it (paying gas)
3. **FastFS**: Stores the updated registry JSON on-chain

This separates signing authority (registry owner) from gas payment (relayer).
