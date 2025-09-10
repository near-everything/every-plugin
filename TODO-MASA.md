# TODO-MASA: Complete Masa Twitter Streaming System

## Current State Summary

The Masa source plugin has been extended with a high-level `search` procedure that encapsulates the submit→poll→get orchestration with state management. The oRPC contract and plugin implementation are mostly complete, but several refinements and the example migration remain.

### Files Status
- ✅ `plugins/masa-source/src/schemas/index.ts` - Extended with search procedure contract, streaming support added
- ✅ `plugins/masa-source/src/index.ts` - Search handler implemented with Effect.TS idioms and streaming logic
- ✅ `examples/masa-stream-idiomatic.ts` - Migrated to use streamPlugin with individual item processing
- ❌ Optional Hono server exposure - Not implemented (Phase 2)

## Outstanding TODOs

### A. Plugin Implementation Fixes

#### 1. Context Typing Safety
**File:** `plugins/masa-source/src/index.ts`  
**Location:** Search handler declaration (~line 302)  
**Issue:** TypeScript error accessing `context.state` (Record<never, never>)  
**Fix:**
```typescript
// Current problematic line:
const currentState = context?.state || {

// Fix with type cast:
const currentState = (context as any)?.state || {
```

#### 2. Historical Window Advance Logic
**File:** `plugins/masa-source/src/index.ts`  
**Location:** Historical branch after items sorting (~line 380)  
**Issue:** No pagination mechanism for continued historical backfill  
**Fix:** Add window advance when maxResults reached:
```typescript
// After sorting items oldest→newest in historical mode:
if (items.length === maxResults && newState.windowStart && items.length > 0) {
  // Move window end to oldest item to continue paging backward
  const oldestItemTime = items[0].createdAt ? 
    new Date(items[0].createdAt) : 
    snowflakeToTimestamp(items[0].externalId);
  newState.windowEnd = oldestItemTime.toISOString();
  // Keep done = false to allow continued paging
}
```

#### 3. Output Ordering Consistency
**File:** `plugins/masa-source/src/index.ts`  
**Location:** Live mode sorting (~line 370)  
**Issue:** Live mode sorts newest→oldest, historical sorts oldest→newest  
**Fix:** Harmonize to oldest→newest for both modes:
```typescript
// Remove the mode-specific sorting and use consistent oldest→newest:
items.sort((a, b) => {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 
               snowflakeToTimestamp(a.externalId).getTime();
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 
               snowflakeToTimestamp(b.externalId).getTime();
  return aTime - bTime; // Always oldest first
});
```

#### 4. Timeout Error Clarity
**File:** `plugins/masa-source/src/index.ts`  
**Location:** Promise.race timeout handling (~line 350)  
**Issue:** Generic timeout error message  
**Fix:**
```typescript
new Promise<never>((_, reject) => 
  setTimeout(() => reject(new Error('Search budget exceeded - increase budgetMs parameter')), input.budgetMs)
)
```

### B. Example Migration to Search Procedure

#### 5. Replace Manual Job Orchestration
**File:** `examples/masa-stream-idiomatic.ts`  
**Sections:** `submitAndAwait`, `runHistorical`, `runLive` functions  
**Issue:** Duplicates plugin orchestration logic  
**Fix:** Replace with single search procedure calls

**New helper function:**
```typescript
const runSearchOnce = (mode: 'historical' | 'live', state: any, params: any) =>
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    return yield* pluginRuntime.executePlugin(plugin, {
      procedure: 'search',
      input: {
        query: '@curatedotfun',
        mode,
        windowDays: params.windowDays || 7,
        maxResults: params.maxResults || 100,
        budgetMs: params.budgetMs || 60000,
        sourceType: 'twitter',
        searchMethod: params.searchMethod || 'searchbyquery',
      },
      state,
    });
  }).pipe(Effect.provide(runtime));
```

**Historical flow replacement:**
```typescript
const runHistorical = (plugin: any, initialState: StreamState) =>
  Effect.gen(function* () {
    let state = initialState;
    console.log(`🏛️ Starting historical backfill`);

    while (true) {
      const result = yield* runSearchOnce('historical', state, {
        windowDays: 30,
        maxResults: 500,
        searchMethod: 'searchbyfullarchive'
      });

      const { items, state: newState, done } = result;
      
      if (items.length > 0) {
        console.log(`📥 Retrieved ${items.length} items`);
        yield* appendToTweetLog(items);
        
        items.forEach((item: any, i: number) => {
          const username = item.authors?.[0]?.username || 'unknown';
          console.log(`${newState.totalProcessed - items.length + i + 1}. @${username} (${item.externalId}) - ${item.createdAt}`);
        });
      }

      state = newState;
      yield* saveState(state);

      if (done) break;
    }

    return { ...state, phase: 'live' as const };
  });
```

**Live flow replacement:**
```typescript
const runLive = (plugin: any, initialState: StreamState) =>
  Effect.gen(function* () {
    let state = initialState;
    console.log(`🔴 Starting live monitoring (${state.totalProcessed} items total)`);

    while (true) {
      try {
        const result = yield* runSearchOnce('live', state, {
          maxResults: 100,
          searchMethod: 'searchbyquery'
        });

        const { items, state: newState, done } = result;

        if (items.length > 0) {
          console.log(`📥 Found ${items.length} new items`);
          yield* appendToTweetLog(items);
          
          items.forEach((item: any, i: number) => {
            const username = item.authors?.[0]?.username || 'unknown';
            console.log(`${newState.totalProcessed - items.length + i + 1}. @${username} (${item.externalId}) - ${item.createdAt}`);
          });
        } else {
          console.log(`⏰ No new items, waiting...`);
        }

        state = newState;
        yield* saveState(state);

        // Wait 10 minutes before next check (configurable)
        const pollMinutes = Number(Bun.env.LIVE_POLL_MINUTES) || 10;
        yield* Effect.sleep(Duration.minutes(pollMinutes));
        
      } catch (error) {
        console.error(`❌ Live monitoring error:`, error);
        yield* Effect.sleep(Duration.seconds(30));
      }
    }
  });
```

#### 6. Update State Interface
**File:** `examples/masa-stream-idiomatic.ts`  
**Location:** StreamState interface  
**Issue:** Local state doesn't match plugin state schema  
**Fix:**
```typescript
interface StreamState {
  phase: 'initial' | 'historical' | 'live' | 'done';
  lastId?: string;
  lastAt?: string;
  windowStart?: string;
  windowEnd?: string;
  totalProcessed: number;
  mode: 'historical' | 'live';
}
```

### C. Optional Enhancements

#### 7. Hono Server for Remote Access
**New File:** `apps/server/src/routers/masa.ts`  
**Purpose:** Expose plugin via HTTP endpoints for remote clients  
**Implementation:**
```typescript
import { Hono } from 'hono';
import { createPluginRuntime } from 'every-plugin/runtime';
import MasaSourcePlugin from '@curatedotfun/masa-source';

const app = new Hono();

// Initialize plugin once at startup
const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/masa-source": {
      remoteUrl: "http://localhost:3013/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    MASA_API_KEY: process.env.MASA_API_KEY || ""
  }
});

const plugin = new MasaSourcePlugin();
// Initialize and get router
const router = plugin.createRouter();

// Mount oRPC routes (requires oRPC-Hono adapter)
app.route('/masa', orpcHonoAdapter(router));

export default app;
```

#### 8. Configuration Improvements
**File:** `examples/masa-stream-idiomatic.ts`  
**Enhancements:**
- Make live poll interval configurable via `LIVE_POLL_MINUTES` env var
- Add `HISTORICAL_WINDOW_DAYS` env var for window size
- Add `MAX_RESULTS_HISTORICAL` and `MAX_RESULTS_LIVE` env vars
- Add `SEARCH_BUDGET_MS` env var for timeout control

#### 9. Enhanced Error Handling
**File:** `plugins/masa-source/src/index.ts`  
**Improvements:**
- Add retry logic with exponential backoff for transient failures
- Better error classification (retryable vs non-retryable)
- Structured logging with correlation IDs
- Rate limiting awareness and backoff hints

#### 10. Monitoring and Metrics
**Future Enhancements:**
- Add telemetry counters for processed items, errors, timeouts
- Export metrics for historical vs live processing rates
- Add health check endpoint that validates Masa API connectivity
- State persistence with atomic writes and corruption recovery

## Implementation Checklist

### Phase 1: Core Fixes (Completed)
- [x] ~~Fix context typing in search handler~~ - Deferred (ignoring type errors as requested)
- [x] Add historical window advance logic
- [x] Harmonize output ordering to oldest→newest
- [x] Improve timeout error messages with Effect.TS timeout
- [x] Update example state interface to match plugin schema
- [x] ~~Replace submitAndAwait with runSearchOnce helper~~ - Replaced with streamPlugin
- [x] ~~Rewrite runHistorical to use search procedure~~ - Replaced with streamPlugin
- [x] ~~Rewrite runLive to use search procedure~~ - Replaced with streamPlugin
- [x] Add streaming support with nextPollMs for automatic transitions
- [x] Test end-to-end historical→live transition via streaming

### Phase 1.1: Streaming Implementation (Completed)
- [x] Update search output schema to include nextState and nextPollMs
- [x] Mark search as streamable in contract (.meta({ "streamable": "true" }))
- [x] Implement nextPollMs logic for streaming control:
  - Historical: 0ms for immediate paging, null to terminate or transition to live
  - Live: 10-minute intervals for continuous polling
- [x] Return both state and nextState for compatibility
- [x] Update streaming tests to work with new contract
- [x] Migrate example to use streamPlugin with individual item processing

### Phase 1.2: Effect.TS Idioms (Completed)
- [x] Replace Promise.race timeout with Effect.timeout and Duration.millis
- [x] Use Effect.tryPromise for job execution with proper error handling
- [x] Keep handlers async returning plain objects, use Effect.runPromise internally
- [x] Remove unused variables (timestampToSnowflake)
- [x] Implement structured streaming with Stream.tap for individual item processing

### Phase 2: Optional Enhancements
- [ ] Create Hono server router for remote access
- [ ] Add comprehensive configuration via env vars
- [ ] Implement enhanced error handling and retries
- [ ] Add monitoring and metrics collection
- [ ] Create oRPC client example for remote consumption
- [ ] Add integration tests for state transitions
- [ ] Document API usage patterns and best practices

## Architecture Decisions

### Plugin vs Example Orchestration
**Decision:** Move orchestration into plugin's `search` procedure  
**Rationale:** Cleaner API, reusable across consumers, centralized state management

### State Management Approach
**Decision:** Plugin returns updated state, consumer persists and passes back  
**Rationale:** Plugin remains stateless, consumer controls persistence strategy

### Ordering Consistency
**Decision:** Always return items oldest→newest regardless of mode  
**Rationale:** Simplifies consumer logic, consistent append-only processing

### Error Handling Strategy
**Decision:** Use oRPC CommonPluginErrors with Masa-specific error mapping  
**Rationale:** Consistent error interface, proper HTTP status codes, retry hints

### Remote Access Pattern
**Decision:** Support both in-process executePlugin and HTTP via Hono+oRPC  
**Rationale:** Flexibility for single-process vs distributed architectures

## Testing Strategy

1. **Unit Tests:** Plugin search handler with various state transitions
2. **Integration Tests:** Full historical→live flow with state persistence
3. **Error Tests:** Timeout handling, API failures, malformed responses
4. **Performance Tests:** Large result sets, memory usage, processing rates
5. **Recovery Tests:** State corruption, interrupted processing, restart behavior

## Remaining Tasks

### Contract Cleanup (Next)
- [ ] Remove legacy `state` field from search output (keep only `nextState`)
- [ ] Update search procedure tests to expect only `nextState` and `done`
- [ ] Verify streaming tests work with cleaned contract

### Future Improvements (Later)
1. **Parallel Processing:** Multiple concurrent jobs for faster historical backfill
2. **Smart Windowing:** Adaptive window sizes based on result density
3. **Deduplication:** Handle duplicate items across time windows
4. **Content Filtering:** Plugin-level filtering by keywords, sentiment, etc.
5. **Rate Limiting:** Built-in respect for Masa API rate limits
6. **Caching:** Cache recent results to avoid redundant API calls
7. **Webhooks:** Real-time push notifications for new items in live mode

## Completed Achievements

✅ **Streaming Implementation:** Plugin now supports proper streaming via `streamPlugin` with automatic state transitions from historical to live mode.

✅ **Effect.TS Idioms:** Timeout handling, error management, and streaming all use idiomatic Effect.TS patterns.

✅ **Simplified Consumer:** Example reduced from ~180 lines of manual orchestration to ~80 lines using built-in streaming.

✅ **Consistent Ordering:** All results sorted oldest→newest for predictable append-only processing.

✅ **State Management:** Plugin handles state transitions automatically while consumer controls persistence.
