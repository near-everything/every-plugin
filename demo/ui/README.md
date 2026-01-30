# ui

Remote frontend module with TanStack Router and Module Federation.

## Module Federation

Exposed as remote module via `remoteEntry.js`:

| Export | Path | Description |
|--------|------|-------------|
| `./Router` | `./src/router.tsx` | TanStack Router instance |
| `./Hydrate` | `./src/hydrate.tsx` | SSR hydration entry |
| `./components` | `./src/components/index.ts` | Reusable UI components |
| `./providers` | `./src/providers/index.tsx` | Context providers |
| `./hooks` | `./src/hooks/index.ts` | React hooks |
| `./types` | `./src/types/index.ts` | TypeScript types |

**Shared dependencies** (singleton via `bos.config.json → shared.ui`):

- `react`, `react-dom`
- `@tanstack/react-query`, `@tanstack/react-router`
- `@hot-labs/near-connect`, `near-kit`
- `better-auth`, `better-near-auth`

## Development

```bash
bos dev --host remote   # Typical: remote host, local UI + API
bos dev --api remote    # Isolate UI work
```

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://example-ui.zephyrcloud.app",
      "ssr": "https://example-ui-ssr.zephyrcloud.app",
      "exposes": {
        "./Router": "./src/router.tsx",
        "./Hydrate": "./src/hydrate.tsx",
        "./components": "./src/components/index.ts",
        "./providers": "./src/providers/index.tsx",
        "./hooks": "./src/hooks/index.ts",
        "./types": "./src/types/index.ts"
      },
      "template": "near-everything/every-plugin/demo/ui",
      "files": [
        "rsbuild.config.ts",
        "tsconfig.json",
        "postcss.config.mjs",
        "components.json"
      ],
      "sync": {
        "scripts": ["dev", "build", "type-check"]
      }
    }
  }
}
```

## Route Protection

File-based routing with auth guards via TanStack Router:

- `_authenticated.tsx` - Requires login, redirects to `/login`
- `_authenticated/_admin.tsx` - Requires admin role

## Tech Stack

- **Framework**: React 19
- **Routing**: TanStack Router (file-based)
- **Data**: TanStack Query + oRPC client
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Build**: Rsbuild + Module Federation
- **Auth**: better-auth client

## Scripts

- `bun dev` - Start dev server (port 3002)
- `bun build` - Build for production
- `bun type-check` - Type checking
