# Potlock Campaign Indexer

A simple micro-service that indexes Potlock campaigns and donations, and (todo) can relay transactions to create campaigns and donate them.

**Tech stack:** [every-plugin](https://plugin.everything.dev/), [Effect-TS](https://effect.website/), [near-kit](https://kit.near.tools/), [Drizzle ORM](https://orm.drizzle.team/), [oRPC](https://orpc.dev/)

## Development

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your NEAR credentials

# Run database migrations
bun run db:push

# Start development server (port 3014)
bun run dev
```

The API will be available at `http://localhost:3014/api`

## Configuration

Required environment variables:

- `FASTNEAR_RPC_URL` - FastNEAR RPC endpoint
- `CAMPAIGN_CONTRACT_ID` - Potlock campaign contract address
- `NEAR_NETWORK` - Network (mainnet/testnet)
- `NEAR_PRIVATE_KEY` - Private key for transaction relay
- `NEAR_SIGNER_ID` - Account ID for signing transactions

## API Endpoints

- `POST /campaigns/list` - List campaigns with filters
- `GET /campaigns/{id}` - Get single campaign
- `POST /campaigns/{id}/donations` - List donations for campaign
- `POST /donations/list` - List all donations
- `POST /campaigns/create` - Create new campaign (relay)
- `POST /sync` - Trigger manual sync
- `GET /sync-status` - Get sync status
- `GET /contract-config` - Get contract configuration
- `GET /ping` - Health check

## Architecture

**ABI-First Approach:**

- `src/abi.ts` - Zod schemas from contract ABI
- `src/contract-client.ts` - Read-only contract view calls
- `src/indexer.ts` - Background sync and backfill
- `src/service.ts` - Business logic and transaction relay
- `src/store/` - Database operations with Drizzle ORM

## License

Part of the Potlock ecosystem.
