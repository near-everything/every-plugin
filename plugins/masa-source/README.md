# Masa Source Plugin for curate.fun

The Masa Source plugin enables comprehensive content ingestion from Twitter/X using the [Masa Data API](https://data.masa.ai/). It provides both real-time streaming and instant search capabilities through a modern oRPC-based architecture.

## 🚀 Features

### **Multiple Search Types**
- **Live Search**: Real-time Twitter data streaming with async job polling
- **Historical Search**: Access to Twitter's full archive
- **Similarity Search**: Instant semantic vector-based search
- **Hybrid Search**: Combined semantic + keyword matching
- **Profile Operations**: User profiles, followers, following, timelines
- **Engagement Data**: Replies, retweets, and interaction metrics
- **Trending Topics**: Current Twitter trends

### **Flexible Data Sources**
- `twitter-credential`: Twitter scraping with credentials
- `twitter-api`: Twitter scraping with API keys  
- `twitter`: General Twitter scraping (best available auth)

### **Advanced Search Methods**
- `searchbyquery`: Live Twitter data
- `searchbyfullarchive`: Historical tweets
- `getbyid`: Single tweet retrieval
- `getreplies`, `getretweeters`: Engagement data
- `gettweets`, `getmedia`: User timeline data
- Profile operations (`searchbyprofile`, `getprofilebyid`, `getfollowers`, `getfollowing`)
- `gettrends`: Trending topics

## 🔧 Setup Guide

### 1. Plugin Registration

Add the Masa Source plugin to your `curate.config.json`:

```jsonc
{
  "plugins": {
    "@curatedotfun/masa-source": {
      "type": "source",
      "url": "https://unpkg.com/@curatedotfun/masa-source@latest/dist/remoteEntry.js"
    }
  }
}
```

### 2. Source Configuration

Configure the plugin in your feed sources:

```jsonc
{
  "feeds": [
    {
      "id": "masa-twitter-feed",
      "sources": [
        {
          "plugin": "@curatedotfun/masa-source",
          "config": {
            "variables": {
              "baseUrl": "https://data.masa.ai/api/v1", // Optional, default shown
              "timeout": 30000, // Optional, 30 seconds default
              "defaultMaxResults": 10 // Optional, default shown
            },
            "secrets": {
              "apiKey": "{MASA_API_KEY}" // Required, hydrated at runtime
            }
          }
        }
      ]
    }
  ]
}
```

> **Note:** Set `MASA_API_KEY` as an environment variable. Get your API key from the [Masa Data API Dashboard](https://data.masa.ai/).

## 📋 Available Procedures

The plugin exposes multiple oRPC procedures for different use cases:

### **search** (Streamable)
Main search operation with async job polling for live and historical data.

```typescript
// Live search
await plugin.search({
  query: "web3 blockchain",
  searchMethod: "searchbyquery", // or "searchbyfullarchive"
  sourceType: "twitter-credential",
  maxResults: 50
});

// User timeline
await plugin.search({
  query: "elonmusk",
  searchMethod: "gettweets",
  sourceType: "twitter",
  maxResults: 20
});
```

### **similaritySearch**
Instant semantic vector search over indexed data.

```typescript
await plugin.similaritySearch({
  query: "artificial intelligence developments",
  sources: ["twitter"],
  keywords: ["AI", "machine learning"],
  keywordOperator: "or",
  maxResults: 25
});
```

### **hybridSearch**
Combined semantic similarity and keyword matching.

```typescript
await plugin.hybridSearch({
  similarityQuery: {
    query: "blockchain innovation",
    weight: 0.7
  },
  textQuery: {
    query: "bitcoin ethereum crypto",
    weight: 0.3
  },
  sources: ["twitter"],
  maxResults: 30
});
```

### **getById**
Fetch a specific tweet by ID.

```typescript
await plugin.getById({
  id: "1234567890123456789",
  sourceType: "twitter"
});
```

### **getBulk**
Fetch multiple tweets by IDs.

```typescript
await plugin.getBulk({
  ids: ["1234567890", "9876543210"],
  sourceType: "twitter"
});
```

### **getProfile**
Get user profile information.

```typescript
await plugin.getProfile({
  username: "elonmusk",
  sourceType: "twitter-credential"
});
```

### **getTrends**
Get current trending topics.

```typescript
await plugin.getTrends({
  sourceType: "twitter"
});
```

## 🔄 State Management

The plugin uses sophisticated state management for resumable searches:

```typescript
// State transitions for async jobs
{
  phase: "submitted" | "processing" | "done" | "error",
  jobId: "uuid-from-masa",
  searchMethod: "searchbyquery",
  sourceType: "twitter-credential",
  nextPollMs: 1000, // Polling interval
  lastProcessedId: "last-tweet-id", // For pagination
  errorMessage: "error details" // If phase is "error"
}
```

### Polling Behavior
- **Submitted**: 1 second polling
- **Processing**: 2 second polling  
- **Done**: 5 second polling for new results
- **Error**: No further polling

## 📊 Output Format

All procedures return items in a standardized format:

```typescript
{
  externalId: string;        // Tweet ID from Masa
  content: string;           // Tweet text content
  contentType?: string;      // "post" for tweets
  createdAt?: string;        // ISO 8601 timestamp
  url?: string;              // Tweet URL
  authors?: Array<{          // Author information
    id?: string;             // User ID
    username?: string;       // @username
    displayName?: string;    // Display name
    url?: string;            // Profile URL
  }>;
  raw: unknown;              // Original Masa API response
}
```

## 🔐 Security & Rate Limits

- **API Key**: Store securely as environment variable
- **Rate Limits**: 
  - Live search: 10 requests/minute per API key
  - Similarity/Hybrid: 3 requests/second
- **Timeouts**: Configurable, 30 seconds default
- **Error Handling**: Comprehensive error reporting with retry logic

## 🏗️ Architecture

The plugin uses a modern oRPC-based architecture:

- **Contract-First**: Type-safe procedure definitions
- **Streaming Support**: Real-time data with state management
- **Dual Search Modes**: Async jobs + instant search
- **Extensible**: Easy to add new Masa API endpoints
- **Effect-Based**: Robust error handling with Effect library

## 🚀 Development

```bash
# Install dependencies
bun install

# Build the plugin
bun run build

# Run in development mode
bun run dev
```

## 📚 Advanced Usage

### Complex Search Queries

Use Twitter's advanced search operators:

```typescript
await plugin.search({
  query: 'from:elonmusk "Tesla" OR "SpaceX" since:2024-01-01',
  searchMethod: "searchbyquery",
  maxResults: 100
});
```

### Profile Analysis

```typescript
// Get user profile
const profile = await plugin.getProfile({ username: "nasa" });

// Get their tweets
const tweets = await plugin.search({
  query: "nasa",
  searchMethod: "gettweets",
  maxResults: 50
});

// Get their followers
const followers = await plugin.search({
  query: "nasa", 
  searchMethod: "getfollowers",
  maxResults: 100
});
```

### Engagement Analysis

```typescript
// Get replies to a tweet
const replies = await plugin.search({
  query: "1234567890123456789",
  searchMethod: "getreplies",
  maxResults: 50
});

// Get who retweeted
const retweeters = await plugin.search({
  query: "1234567890123456789", 
  searchMethod: "getretweeters",
  maxResults: 100
});
```

## 🔗 Related Resources

- [Masa Data API Documentation](https://developers.masa.ai/docs/index-API/masa-api-search)
- [Twitter Advanced Search Operators](https://help.twitter.com/en/using-twitter/twitter-advanced-search)
- [oRPC Documentation](https://orpc.unnoq.com/)

## 📄 License

MIT
