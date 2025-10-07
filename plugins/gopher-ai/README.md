# GopherAI Plugin

A plugin for accessing Twitter, TikTok, and Reddit data through the [GopherAI/Masa Data API](https://data.gopher-ai.com/). Provides streaming search, similarity search, and comprehensive social media data access for the every-plugin framework.

## Installation

Add to your registry:
```typescript
const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/gopher-ai": {
      remoteUrl: "https://cdn.zephyr.com/v123/plugins/gopher-ai/remoteEntry.js",  // For production
    }
  },
  secrets: { GOPHERAI_API_KEY: "your-api-key" }
});

// Or for local development:
const runtime = createLocalPluginRuntime(
  { registry: {} },
  { "@curatedotfun/gopher-ai": import("./src") }
);
```

## Usage

```typescript
const { client } = await runtime.usePlugin("@curatedotfun/gopher-ai", {
  variables: { timeout: 30000 },
  secrets: { apiKey: "{{GOPHERAI_API_KEY}}" }
});

// Streaming search with live updates
const stream = await client.search({
  query: "artificial intelligence",
  sourceType: "twitter",
  maxTotalResults: 100
});
for await (const item of stream) {
  console.log(item.content);
}

// Instant similarity search
const results = await client.similaritySearch({
  query: "blockchain technology",
  sources: ["twitter"],
  maxResults: 25
});

// Get a specific tweet
const tweet = await client.getById({
  id: "1234567890123456789",
  sourceType: "twitter"
});
```

## Configuration

Required secrets:
- `apiKey` - Your GopherAI API key

Optional variables:
- `baseUrl` - API endpoint URL (default: "https://data.gopher-ai.com/api/v1")
- `timeout` - Request timeout in milliseconds (default: 30000)

## Available Procedures

### Streaming Search
- `search` - Main streaming procedure with backfill + live updates
- `backfill` - Historical search without live updates
- `live` - Live-only search without backfill

### Instant Search
- `similaritySearch` - Vector-based semantic search
- `hybridSearch` - Combined semantic + keyword search

### Data Access
- `getById` - Fetch single item by ID
- `getBulk` - Fetch multiple items by IDs
- `getProfile` - Get user profile information
- `getTrends` - Get trending topics

All procedures support `sourceType`: "twitter", "tiktok", or "reddit".

---

**For plugin developers, see [LLM.txt](./LLM.txt) for comprehensive technical documentation.**
