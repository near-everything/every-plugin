#!/usr/bin/env bun

import { Duration, Effect, Logger, LogLevel } from "every-plugin/effect";
import type { GopherResult } from "../../../plugins/gopher-ai/src/contract";
import { plugins } from "../plugins";
import { DatabaseService } from "../services/db.service";

// Worker ID for tracking which worker is processing tasks
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Content categorization types
interface CuratedContent {
  originalPost: {
    externalId: string;
    content: string;
    author: { username?: string; id?: string; displayName?: string } | null;
    createdAt?: string;
    url?: string;
  } | null;
  threadContent: Array<{
    externalId: string;
    content: string;
    author: { username?: string; id?: string; displayName?: string } | null;
    createdAt?: string;
  }>;
  conversationalContext: Array<{
    externalId: string;
    content: string;
    author: { username?: string; id?: string; displayName?: string } | null;
    createdAt?: string;
  }>;
  curatorNotes?: string;
  hashtags: string[];
  curatorUsername: string;
}

// Extract curator notes and hashtags from !submit command
const parseCuratorSubmission = (content: string) => {
  const submitMatch = content.match(/!submit\s+(.+)/i);
  const curatorNotes = submitMatch ? submitMatch[1]?.trim() : "";
  const hashtags = curatorNotes?.match(/#\w+/g) || [];

  return { curatorNotes, hashtags };
};

// Categorize content based on authorship
const categorizeContent = (
  replies: GopherResult[],
  originalAuthorUsername?: string
): { threadContent: GopherResult[]; conversationalContext: GopherResult[] } => {
  const threadContent: GopherResult[] = [];
  const conversationalContext: GopherResult[] = [];

  for (const reply of replies) {
    // Access author_username via catchall since it's not in base schema
    const replyAuthor = reply.author_username;

    if (replyAuthor === originalAuthorUsername) {
      // This is additional content from the original author
      threadContent.push(reply);
    } else {
      // This is conversational context from other users
      conversationalContext.push(reply);
    }
  }

  return { threadContent, conversationalContext };
};

// Perform structured analysis on curated content
const analyzeContent = (content: CuratedContent) => {
  console.log(`🎯 Content Analysis Summary:`);
  console.log(`   Original Post: @${content.originalPost?.author?.username} - "${content.originalPost?.content.substring(0, 80)}..."`);
  console.log(`   Thread Posts: ${content.threadContent.length} additional posts from original author`);
  console.log(`   Community Replies: ${content.conversationalContext.length} replies from other users`);
  console.log(`   Curator: @${content.curatorUsername}`);
  console.log(`   Curator Notes: "${content.curatorNotes}"`);
  console.log(`   Hashtags: ${content.hashtags.join(", ")}`);

  // Here you could implement more sophisticated analysis:
  // - Sentiment analysis on original content vs community responses
  // - Topic extraction and categorization
  // - Quality scoring based on engagement patterns
  // - Content similarity analysis between curator notes and original content

  return {
    summary: {
      originalAuthor: content.originalPost?.author?.username,
      curator: content.curatorUsername,
      totalThreadPosts: content.threadContent.length + 1, // +1 for original
      communityEngagement: content.conversationalContext.length,
      categories: content.hashtags,
      curatorAnalysis: content.curatorNotes
    }
  };
};


// Process a single submission task
const processSubmissionTask = (task: any) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const { client } = plugins.gopherAi;

    console.log(`🔄 Processing submission task ${task.id} for item ${task.itemId}`);

    // Get the item that contains the !submit
    const item = yield* db.getItem(task.itemId);

    if (!item) {
      yield* db.markTaskFailed(task.id, "Item not found");
      return;
    }

    console.log(`📝 Found !submit from @${item.originalAuthorUsername}: "${item.content.substring(0, 100)}..."`);

    // Parse curator submission
    const { curatorNotes, hashtags } = parseCuratorSubmission(item.content);
    console.log(`📋 Curator notes: "${curatorNotes}"`);
    console.log(`🏷️ Hashtags: ${hashtags.join(", ")}`);

    // Initialize curated content structure
    const curatedContent: CuratedContent = {
      originalPost: null,
      threadContent: [],
      conversationalContext: [],
      curatorNotes,
      hashtags,
      curatorUsername: item.originalAuthorUsername || 'unknown'
    };

    // If we have a conversation_id, fetch the original post and its replies
    if (item.conversationId) {
      console.log(`🔍 Fetching original post for ID: ${item.conversationId}`);

      // First, get the original post being curated
      const originalPostResult = yield* Effect.promise(() =>
        client.getById({
          id: item.conversationId!,
          sourceType: 'twitter' as const
        })
      ).pipe(
        Effect.catchAll((error: unknown) => {
          console.error(`Failed to fetch original post: ${error}`);
          return Effect.succeed({ item: null });
        })
      );

      if (originalPostResult.item) {
        const originalPost: GopherResult = originalPostResult.item;
        curatedContent.originalPost = {
          externalId: originalPost.id, // Changed from externalId
          content: originalPost.content,
          author: {
            username: originalPost.author_username,
            id: originalPost.author_id,
            displayName: originalPost.author_username
          },
          createdAt: originalPost.created_at || originalPost.updated_at,
          url: originalPost.tweet_url || `https://twitter.com/${originalPost.author_username}/status/${originalPost.id}`
        };

        console.log(`📝 Original post: @${curatedContent.originalPost.author?.username}: "${curatedContent.originalPost.content.substring(0, 100)}..."`);

        // Now get all replies to understand the full conversation
        console.log(`🔍 Fetching replies for conversation ID: ${item.conversationId}`);

        const repliesResult = yield* Effect.promise(() =>
          client.getReplies({
            conversationId: item.conversationId!,
            sourceType: 'twitter' as const,
            maxResults: 50
          })
        ).pipe(
          Effect.catchAll((error: unknown) => {
            console.error(`Failed to fetch replies: ${error}`);
            return Effect.succeed({ replies: [] });
          })
        );

        console.log(`📄 Retrieved ${repliesResult.replies.length} replies`);

        // Categorize the replies
        const { threadContent, conversationalContext } = categorizeContent(
          repliesResult.replies,
          curatedContent.originalPost.author?.username
        );

        curatedContent.threadContent = threadContent.map(reply => ({
          externalId: reply.id,
          content: reply.content,
          author: {
            username: reply.author_username,
            id: reply.author_id,
            displayName: reply.author_username
          },
          createdAt: reply.created_at || reply.updated_at
        }));

        curatedContent.conversationalContext = conversationalContext.map(reply => ({
          externalId: reply.id,
          content: reply.content,
          author: {
            username: reply.author_username,
            id: reply.author_id,
            displayName: reply.author_username
          },
          createdAt: reply.created_at || reply.updated_at
        }));

        // Perform analysis
        const analysis = analyzeContent(curatedContent);
        console.log(`✨ Analysis completed:`, analysis.summary);

      } else {
        console.log(`⚠️ Could not fetch original post for ID: ${item.conversationId}`);
      }
    } else {
      console.log(`⚠️ No conversation_id found, processing as standalone submission`);
    }

    // Mark as completed
    yield* db.markTaskCompleted(task.id);
    console.log(`✅ Completed submission task ${task.id}`);
  });

// Main worker loop
const workerLoop = Effect.gen(function* () {
  const db = yield* DatabaseService;

  console.log(`🚀 Starting submission worker ${WORKER_ID}`);

  // Continuous processing loop
  yield* Effect.forever(
    Effect.gen(function* () {
      // Get next pending task
      const task = yield* db.getNextPendingTask();

      if (!task) {
        // No tasks available, wait before checking again
        yield* Effect.sleep(Duration.seconds(5));
        return;
      }

      // Try to claim the task
      const claimed = yield* db.markTaskProcessing(task.id, WORKER_ID);

      if (!claimed) {
        // Another worker claimed it, continue
        return;
      }

      // Process the task with error handling
      yield* processSubmissionTask(task).pipe(
        Effect.catchAll((error: unknown) =>
          Effect.gen(function* () {
            console.error(`❌ Failed to process task ${task.id}:`, error);
            yield* db.markTaskFailed(task.id, error instanceof Error ? error.message : String(error));
          })
        )
      );
    })
  );
});

// Graceful shutdown handler
const setupShutdown = Effect.gen(function* () {
  const shutdown = () => {
    console.log(`\n🛑 Shutting down worker ${WORKER_ID}...`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});

// Main program
const program = Effect.gen(function* () {
  yield* setupShutdown;
  yield* workerLoop;
}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseService.Default)
);

// Run the worker
await Effect.runPromise(program);
