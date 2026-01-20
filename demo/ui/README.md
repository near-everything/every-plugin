# ui

Remote frontend module with TanStack Router.

## Module Federation

Exposed as remote module for host consumption via `remoteEntry.js`:

| Export | Path | Description |
|--------|------|-------------|
| `./Router` | `router.tsx` | TanStack Router instance |
| `./components` | `components/index.ts` | Reusable UI components |
| `./providers` | `providers/index.tsx` | Context providers |
| `./hooks` | `hooks/index.ts` | React hooks |
| `./types` | `types/index.ts` | TypeScript types |

**Shared dependencies** (singleton):

- `react`, `react-dom`
- `@tanstack/react-query`, `@tanstack/react-router`
- `@hot-labs/near-connect`, `near-kit`

## Route Protection

File-based routing with auth guards via TanStack Router:

- `_authenticated.tsx` - Requires login, redirects to `/login`
- `_authenticated/_admin.tsx` - Requires admin role

## Tech Stack

- **Framework**: React 19
- **Routing**: TanStack Router (file-based)
- **Data**: TanStack Query + oRPC client
- **Styling**: Tailwind CSS v4
- **Build**: Rsbuild + Module Federation
- **Auth**: better-auth client

## Available Scripts

- `bun dev` - Start dev server (port 3002)
- `bun build` - Build for production
- `bun typecheck` - Type checking

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://cdn.example.com/ui",
      "exposes": {
        "Router": "./router.tsx",
        "components": "./components/index.ts",
        "providers": "./providers/index.tsx",
        "hooks": "./hooks/index.ts",
        "types": "./types/index.ts"
      }
    }
  }
}
```
