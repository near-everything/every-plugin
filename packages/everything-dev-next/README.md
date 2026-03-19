# everything-dev-next

A consolidated product package for building Module Federation apps with oRPC APIs.

## Subpath Exports

- `everything-dev-next/types` - Zod schemas and TypeScript types
- `everything-dev-next/config` - Config loading and resolution
- `everything-dev-next/shared` - Shared dependency policy generation
- `everything-dev-next/mf` - Module Federation runtime utilities
- `everything-dev-next/plugin` - Plugin authoring (re-exports from every-plugin)
- `everything-dev-next/api` - API plugin loading and router stitching
- `everything-dev-next/host` - Host server orchestration
- `everything-dev-next/cli` - CLI entry point

## Demo

See `demo-next/docs-book/` for a minimal example that demonstrates:
- Host server loading UI and API remotes via MF manifest
- API plugin with oRPC contract
- UI with TanStack Router
- E2E tests with Playwright

## Quick Start

```bash
# Build the package
cd packages/everything-dev-next
npm run build

# Run the demo
cd ../../demo-next/docs-book/host
npm run dev
```

## Architecture

```
bos.config.json
  ↓
everything-dev-next/config (load + resolve)
  ↓
everything-dev-next/shared (generate shared deps policy)
  ↓
everything-dev-next/host (orchestrate)
  ├── everything-dev-next/api (load API plugins via MF)
  └── everything-dev-next/mf (load UI remote via MF)
```

## MF Manifest Standard

All remotes (UI + API) use `mf-manifest.json` as the standard entry point:

- `ui.entry = <uiBaseUrl>/mf-manifest.json`
- `api.entry = <apiBaseUrl>/mf-manifest.json`

This ensures consistent remote loading across Node SSR and browser environments.
