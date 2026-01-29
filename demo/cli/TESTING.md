# BOS CLI Test Framework

This document describes the CLI test framework for running commands against a `bos.config.json` configuration.

## Overview

The test framework executes CLI commands programmatically against bos.config.json files, verifying that commands produce expected results. By default, tests run against the repo's `demo/bos.config.json` (every.near/everything.dev), but users can run tests against their own configured bos.config.json.

## Directory Structure

```
demo/cli/tests/
├── fixtures/
│   └── bos.config.json          # Copy of repo's default config for isolation
├── helpers/
│   └── cli-runner.ts            # Programmatic CLI execution helper
├── integration/
│   ├── info.test.ts             # bos info - read-only config inspection
│   ├── status.test.ts           # bos status - endpoint health checks
│   ├── sync.test.ts             # bos sync - config sync from Near Social
│   ├── start.test.ts            # bos start - server lifecycle testing
│   └── files-sync.test.ts       # bos files sync - template file syncing
└── vitest.config.ts
```

## Running Tests

### Default (repo config)

```bash
cd demo/cli
bun test
```

Tests run against `demo/bos.config.json` which configures:
- Account: `every.near`
- Template: `near-everything/every-plugin/demo`
- Packages: host, ui, api

### Custom Config

Users can test their own bos.config.json:

```bash
# Set custom config path via environment variable
BOS_CONFIG_PATH=/path/to/your/bos.config.json bun test

# Or use the config command (future)
bos config test --path /path/to/your/bos.config.json
```

## Test Categories

### 1. Read-Only Commands (Safe)

These tests have no side effects and can run in any environment:

**`bos info`**
- Reads and validates bos.config.json
- Lists packages and remotes
- Verifies schema compliance

**`bos status`**
- Checks endpoint health (development/production URLs)
- Reports latency for each endpoint
- Validates endpoint accessibility

### 2. Sync Commands

**`bos sync`**
- Fetches config from Near Social registry
- Verifies account resolution
- Validates catalog and package updates

**`bos files sync`**
- Syncs template files from GitHub
- Verifies file creation/updates
- Validates dependency additions

### 3. Server Lifecycle Commands

**`bos start`**
- Starts host server
- Verifies server responds at configured URL
- Tests graceful shutdown

**`bos dev`**
- Starts development environment
- Verifies hot reload capabilities
- Tests multi-process coordination

## CLI Runner Helper

The `cli-runner.ts` helper provides programmatic access to CLI commands:

```typescript
import { createCliRunner } from "./helpers/cli-runner";

const cli = await createCliRunner({
  configPath: "path/to/bos.config.json",
  tempDir: true, // isolate in temp directory
});

// Execute commands
const info = await cli.info();
const status = await cli.status({ env: "development" });
const syncResult = await cli.sync({ account: "every.near" });

// Cleanup
await cli.cleanup();
```

### Runner Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `configPath` | string | `demo/bos.config.json` | Path to bos.config.json |
| `tempDir` | boolean | `true` | Run in isolated temp directory |
| `timeout` | number | `30000` | Command timeout in ms |

## Example Tests

### Info Command Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createCliRunner } from "../helpers/cli-runner";

describe("bos info", () => {
  let cli: CliRunner;

  beforeAll(async () => {
    cli = await createCliRunner();
  });

  afterAll(async () => {
    await cli.cleanup();
  });

  it("returns valid config structure", async () => {
    const result = await cli.info();
    
    expect(result.config).toBeDefined();
    expect(result.config.account).toBe("every.near");
    expect(result.packages).toContain("host");
    expect(result.packages).toContain("ui");
    expect(result.packages).toContain("api");
  });

  it("lists all remotes", async () => {
    const result = await cli.info();
    
    expect(result.remotes).toBeDefined();
    expect(Array.isArray(result.remotes)).toBe(true);
  });
});
```

### Status Command Test

```typescript
describe("bos status", () => {
  let cli: CliRunner;

  beforeAll(async () => {
    cli = await createCliRunner();
  });

  afterAll(async () => {
    await cli.cleanup();
  });

  it("checks production endpoints", async () => {
    const result = await cli.status({ env: "production" });
    
    expect(result.endpoints).toBeDefined();
    expect(result.endpoints.length).toBeGreaterThan(0);
    
    for (const endpoint of result.endpoints) {
      expect(endpoint).toHaveProperty("name");
      expect(endpoint).toHaveProperty("url");
      expect(endpoint).toHaveProperty("healthy");
    }
  });

  it("reports endpoint latency", async () => {
    const result = await cli.status({ env: "production" });
    
    const healthyEndpoints = result.endpoints.filter(e => e.healthy);
    for (const endpoint of healthyEndpoints) {
      expect(endpoint.latency).toBeTypeOf("number");
      expect(endpoint.latency).toBeGreaterThan(0);
    }
  });
});
```

### Sync Command Test

```typescript
describe("bos sync", () => {
  let cli: CliRunner;

  beforeAll(async () => {
    cli = await createCliRunner({ tempDir: true });
  });

  afterAll(async () => {
    await cli.cleanup();
  });

  it("syncs config from Near Social", async () => {
    const result = await cli.sync({ account: "every.near" });
    
    expect(result.status).toBe("synced");
    expect(result.account).toBe("every.near");
    expect(result.gateway).toBeDefined();
  });

  it("updates catalog on sync", async () => {
    const result = await cli.sync({ force: true });
    
    expect(result.catalogUpdated).toBe(true);
  });
});
```

### Start Command Test

```typescript
describe("bos start", () => {
  let cli: CliRunner;

  beforeAll(async () => {
    cli = await createCliRunner({ tempDir: true });
  });

  afterAll(async () => {
    await cli.cleanup();
  });

  it("starts server and responds", async () => {
    const result = await cli.start({ port: 3999 });
    
    expect(result.status).toBe("running");
    expect(result.url).toContain("localhost:3999");
    
    // Verify server responds
    const response = await fetch(result.url);
    expect(response.ok).toBe(true);
    
    // Cleanup handled by cli.cleanup()
  });
});
```

## Integration with Host Tests

The CLI tests build on patterns from `demo/host/tests/integration/`:

- Same vitest config approach with tsconfig paths
- Shared utilities for config loading
- Consistent test structure and assertions

### Relationship to SEO/SSR Tests

The existing `demo/host/tests/integration/` tests verify:
- RouterModule loading from production SSR remote
- SEO head extraction for routes
- HTML rendering with proper meta tags

CLI tests complement these by verifying:
- Config is correctly parsed and validated
- Sync operations update config correctly
- Server starts and serves the configured app

## CI/CD Integration

### GitHub Actions

```yaml
name: CLI Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Run CLI tests
        run: |
          cd demo/cli
          bun test
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `BOS_CONFIG_PATH` | Custom config path for testing |
| `BOS_TEST_TIMEOUT` | Override default test timeout |
| `BOS_SKIP_NETWORK` | Skip tests requiring network access |

## Mock Strategies

For offline testing or CI without network access:

### Mock Near Social

```typescript
import { vi } from "vitest";

vi.mock("../lib/near-social", () => ({
  fetchConfig: vi.fn().mockResolvedValue({
    account: "test.near",
    app: { host: { /* ... */ } }
  })
}));
```

### Mock Endpoints

```typescript
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.get("https://everything.dev", () => {
    return HttpResponse.json({ status: "ok" });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());
```

## Commands Reference

| Command | Contract | Test Priority |
|---------|----------|---------------|
| `bos info` | `InfoResult` | High - read-only |
| `bos status` | `StatusResult` | High - read-only |
| `bos sync` | `SyncResult` | High - core feature |
| `bos files sync` | `FilesSyncResult` | High - new feature |
| `bos start` | `StartResult` | Medium - requires server |
| `bos dev` | `DevResult` | Medium - complex lifecycle |
| `bos build` | `BuildResult` | Low - requires setup |
| `bos publish` | `PublishResult` | Low - mainnet interaction |

## Future Enhancements

1. **Snapshot Testing**: Compare command outputs against known-good snapshots
2. **Performance Benchmarks**: Track command execution times
3. **Coverage Reports**: Measure CLI code coverage
4. **Visual Regression**: Screenshot comparisons for `bos start` output
