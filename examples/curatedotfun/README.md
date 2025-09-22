# Curated.fun - Enhanced Masa Streaming with Database Storage

This enhanced version of the Masa streaming example stores all scraped social media items in a SQLite database and provides a processing queue for !submit commands.

## Features

- **Persistent Storage**: All items stored in SQLite database with duplicate prevention
- **Platform Agnostic**: Supports Twitter, TikTok, Reddit (via Masa API)
- **Processing Queue**: Automatic detection and queuing of !submit commands
- **Resumable Streaming**: State persisted in database, survives restarts
- **Background Workers**: Separate processes for handling submission analysis
- **Effect.TS Integration**: Robust error handling and concurrency

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set your Masa API key in `.env`:
```bash
MASA_API_KEY=your-masa-api-key-here
```

3. Make sure the Masa plugin is running on localhost:3013

## Usage

### Start the main streaming process:
```bash
bun run start
# or for development with auto-reload:
bun run dev
```

This will:
- Stream @curatedotfun mentions from Masa
- Store all items in `database.db`
- Detect !submit commands and add them to processing queue
- Handle duplicates automatically
- Resume from last position on restart

### Start the submission worker (in separate terminal):
```bash
bun run worker
# or for development:
bun run worker:dev
```

This will:
- Process !submit items from the queue
- Extract curator notes and hashtags
- Perform thread analysis (TODO)
- Handle retries and error recovery

## Database Schema

- **items**: All scraped social media content
- **processing_queue**: !submit items awaiting analysis
- **stream_state**: Streaming position and phase tracking

## File Structure

```
├── main.ts                    # Main streaming application
├── schemas/database.ts        # Database schema definitions
├── services/db.service.ts     # Database operations with Effect.TS
├── workers/submission.worker.ts # Background processing worker
└── database.db           # SQLite database (auto-created)
```

## Next Steps

The current implementation provides the foundation for:
- Moderation workflow (approve/reject submissions)
- Thread analysis using Masa's getById/getreplies
- Sentiment analysis and insight extraction
- RSS feed generation and other outputs
