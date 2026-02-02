# Moltbot + BOS Integration Guide

Deploy AI-powered BOS apps via Telegram, Discord, or Slack using the Moltbot (Openclaw) + BOS RPC Sidecar architecture.

## Architecture Overview

```
User → Telegram/Discord/Slack → Moltbot (Openclaw AI)
                                     ↓
                            Openclaw executes/calls API
                                     ↓
                            BOS RPC Sidecar (bos serve :4000)
                               /api/rpc endpoints:
                                 • create() - scaffold apps
                                 • build() - compile packages
                                 • deploy() - push to Zephyr
                                 • publish() - Near Social
                                 • register() - create subaccounts
                                     ↓
                            Near Social + Zephyr Cloud
                                     ↓
                            Apps live at <name>.moltbot.near
```

## How It Works

1. **User sends message** to bot via Telegram/Discord/Slack
2. **Moltbot AI** (powered by Openclaw) interprets the request
3. **Openclaw calls** the BOS RPC Sidecar endpoints
4. **BOS CLI executes** create/build/deploy/publish commands
5. **App is deployed** to `<project>.moltbot.near`

---

## Environment Variables

Configure these in your Railway deployment:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEAR_ACCOUNT` | Parent account for deployments | `moltbot.near` |
| `NEAR_SEED_PHRASE` | Account recovery phrase | `word1 word2 ...` |
| `BOS_SERVE_PORT` | RPC sidecar port | `4000` |
| `GATEWAY_URL` | Openclaw gateway URL | `http://localhost:3000` |
| `DISCORD_TOKEN` | Discord bot token | `...` |
| `TELEGRAM_TOKEN` | Telegram bot token | `...` |
| `SLACK_TOKEN` | Slack bot token | `...` |

---

## RPC Endpoints

The BOS RPC Sidecar exposes these endpoints at `/api/rpc`:

### `create()`
Scaffold a new BOS application.

```json
{
  "method": "create",
  "params": {
    "name": "myproject",
    "template": "plugin"
  }
}
```

### `build()`
Compile all packages in the project.

```json
{
  "method": "build",
  "params": {
    "path": "./projects/myproject"
  }
}
```

### `deploy()`
Push packages to Zephyr Cloud CDN.

```json
{
  "method": "deploy",
  "params": {
    "path": "./projects/myproject"
  }
}
```

### `publish()`
Register the app on NEAR Social.

```json
{
  "method": "publish",
  "params": {
    "account": "myproject.moltbot.near",
    "path": "./projects/myproject"
  }
}
```

### `register()`
Create a new subaccount under the parent.

```json
{
  "method": "register",
  "params": {
    "name": "myproject"
  }
}
```

---

## Multi-Tenant Flow

When a user requests a new project, the full flow is:

1. **User**: "Create a dashboard called myproject"
2. **Bot → register()**: Creates `myproject.moltbot.near` subaccount
3. **Bot → create()**: Scaffolds project with template
4. **Bot → AI coding**: Implements requested features
5. **Bot → build()**: Compiles all packages
6. **Bot → deploy()**: Pushes to Zephyr Cloud
7. **Bot → publish()**: Registers on NEAR Social
8. **Result**: Live at `myproject.moltbot.everything.dev`

---

## Setup Instructions

### 1. Clone the Moltbot Railway Template

```bash
git clone https://github.com/near-everything/moltbot-railway-template
cd moltbot-railway-template
```

### 2. Install Dependencies

```bash
bun install
bun add everything-dev
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 4. Start the Services

```bash
# Terminal 1: Start BOS RPC Sidecar
bos serve -p 4000

# Terminal 2: Start Moltbot
bun run start
```

### 5. Deploy to Railway

```bash
railway up
```

---

## Dockerfile Configuration

```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Install BOS CLI
RUN bun add -g everything-dev

# Copy project files
COPY package.json bun.lock ./
RUN bun install

COPY . .

# Start both services
CMD ["sh", "-c", "bos serve -p 4000 & bun run start"]
```

---

## Example Conversations

### Creating a Simple App

```
User: Create a counter app
Bot: Creating counter.moltbot.near...
     ✓ Account created
     ✓ Project scaffolded
     ✓ Implementing counter logic
     ✓ Building packages
     ✓ Deploying to Zephyr
     ✓ Publishing to NEAR Social
     
     Your app is live at:
     https://counter.moltbot.everything.dev
```

### Updating an Existing App

```
User: Add dark mode to my counter app
Bot: Updating counter.moltbot.near...
     ✓ Adding dark mode toggle
     ✓ Updating theme provider
     ✓ Building packages
     ✓ Deploying changes
     
     Dark mode added! Refresh your app.
```

---

## Related Resources

- [BOS CLI Documentation](/page/bos-cli-guide)
- [Everything Gateway](/page/gateway-guide)
- [NEAR Social Integration](/page/near-social-guide)
- [Zephyr Cloud CDN](/page/zephyr-guide)
- [NOVA SDK Secrets](/page/nova-sdk-guide)
