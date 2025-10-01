import { Effect, Layer, Logger } from "effect";
import { EmbeddingsService, EmbeddingsServiceLive } from "../services/embeddings.service";
import { DatabaseService, DatabaseServiceLive } from "../services/db.service";

// Migration script to generate embeddings for existing messages
const generateEmbeddingsForExistingMessages = Effect.gen(function* () {
  const databaseService = yield* DatabaseService;
  const embeddingsService = yield* EmbeddingsService;

  console.log('[Migration] Starting embeddings generation for existing messages...');

  let processedCount = 0;
  let totalProcessed = 0;
  const batchSize = 50;

  while (true) {
    // Get batch of messages without embeddings
    const messages = yield* databaseService.getMessagesWithoutEmbeddings(batchSize);
    
    if (messages.length === 0) {
      break;
    }

    console.log(`[Migration] Processing batch of ${messages.length} messages...`);

    // Filter out messages with empty content or commands
    const validMessages = messages.filter(msg => 
      msg.content && 
      msg.content.trim().length > 0 && 
      !msg.isCommand &&
      msg.contentType === 'text'
    );

    if (validMessages.length === 0) {
      // Mark empty messages as processed by setting embedding to empty buffer
      for (const msg of messages) {
        const emptyEmbedding = new Float32Array(384).fill(0);
        yield* databaseService.updateMessageEmbedding(msg.id, emptyEmbedding);
      }
      processedCount += messages.length;
      continue;
    }

    try {
      // Generate embeddings in batch
      const texts = validMessages.map(msg => msg.content);
      const embeddings = yield* embeddingsService.generateBatchEmbeddings(texts);

      // Update database with embeddings
      for (let i = 0; i < validMessages.length; i++) {
        const msg = validMessages[i];
        const embedding = embeddings[i];
        
        if (msg && embedding) {
          yield* databaseService.updateMessageEmbedding(msg.id, embedding);
          processedCount++;
        }
      }

      // Mark remaining messages (if any) with empty embeddings
      const remainingMessages = messages.filter(msg => 
        !validMessages.some(valid => valid.id === msg.id)
      );
      
      for (const msg of remainingMessages) {
        const emptyEmbedding = new Float32Array(384).fill(0);
        yield* databaseService.updateMessageEmbedding(msg.id, emptyEmbedding);
        processedCount++;
      }

      totalProcessed += processedCount;
      console.log(`[Migration] Processed ${processedCount} messages (${validMessages.length} with real embeddings)`);
      
    } catch (error) {
      console.error(`[Migration] Error processing batch:`, error);
      
      // Mark problematic messages with empty embeddings to continue
      for (const msg of messages) {
        try {
          const emptyEmbedding = new Float32Array(384).fill(0);
          yield* databaseService.updateMessageEmbedding(msg.id, emptyEmbedding);
          processedCount++;
        } catch (updateError) {
          console.error(`[Migration] Failed to mark message ${msg.id} as processed:`, updateError);
        }
      }
    }

    // Add small delay between batches to prevent overwhelming the system
    yield* Effect.sleep("1 second");
  }

  console.log(`[Migration] Completed! Processed ${totalProcessed} total messages`);
});

// Layer composition
const MainLayer = Layer.mergeAll(
  DatabaseServiceLive,
  EmbeddingsServiceLive
).pipe(Layer.provide(Logger.pretty));

// Run the migration
const program = generateEmbeddingsForExistingMessages.pipe(
  Effect.provide(MainLayer),
  Effect.catchAll((error) =>
    Effect.sync(() => {
      console.error('[Migration] Fatal error:', error);
      process.exit(1);
    })
  )
);

Effect.runPromise(program).then(() => {
  console.log('[Migration] Migration completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('[Migration] Migration failed:', error);
  process.exit(1);
});
