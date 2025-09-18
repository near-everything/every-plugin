#!/usr/bin/env bun

import { Effect, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import type { NewChat, NewItem, NewUser } from "./schemas/database";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";

// Configuration constants
const TARGET_CHAT_ID = Bun.env.TELEGRAM_CHAT_ID; // Optional: monitor specific chat
const BOT_TOKEN = Bun.env.TELEGRAM_BOT_TOKEN || "your-bot-token-here";

const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/telegram-source": {
      remoteUrl: "https://elliot-braem-1--curatedotfun-telegram-source-ever-62551c899-ze.zephyrcloud.app/remoteEntry.js", // Update when plugin is deployed
      type: "source"
    }
  },
  secrets: {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN
  }
});

// Helper to detect bot commands in content
const detectBotCommands = (content: string): string[] => {
  const commands: string[] = [];
  if (content.toLowerCase().includes("!submit")) commands.push("submit");
  if (content.startsWith("/")) commands.push("command");
  return commands;
};

// Helper to extract chat information from Telegram message
const extractChatInfo = (item: any): NewChat | null => {
  const message = item.raw?.message;
  if (!message) return null;

  return {
    chatId: message.chat.id.toString(),
    chatType: message.chat.type,
    title: message.chat.title,
    username: message.chat.username,
    description: message.chat.description,
    memberCount: message.chat.member_count,
    lastMessageAt: item.createdAt,
  };
};

// Helper to extract user information from Telegram message
const extractUserInfo = (item: any): NewUser | null => {
  const message = item.raw?.message;
  if (!message?.from) return null;

  const user = message.from;
  return {
    userId: user.id.toString(),
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    displayName: `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`,
    languageCode: user.language_code,
    isBot: user.is_bot,
    lastMessageAt: item.createdAt,
    messageCount: 1, // Will be updated by upsert logic
  };
};

// Convert Telegram plugin item to database item
const convertToDbItem = (item: any): NewItem => {
  const message = item.raw?.message;
  const commands = detectBotCommands(item.content);

  return {
    externalId: item.externalId,
    platform: 'telegram',
    content: item.content,
    contentType: item.contentType || 'message',

    // Telegram-specific fields
    chatId: message?.chat.id.toString(),
    messageId: message?.message_id,
    chatType: message?.chat.type,
    chatTitle: message?.chat.title,
    chatUsername: message?.chat.username,

    // Author information
    originalAuthorId: message?.from?.id.toString(),
    originalAuthorUsername: message?.from?.username,
    originalAuthorDisplayName: item.authors?.[0]?.displayName,

    // Message metadata
    isCommand: commands.length > 0,
    isMentioned: item.isMentioned || false,
    replyToMessageId: message?.reply_to_message?.message_id,
    forwardFromUserId: message?.forward_from?.id.toString(),

    // Timestamps
    createdAt: item.createdAt,
    url: item.url,
    rawData: JSON.stringify(item.raw),
  };
};

// Enhanced item processing with database storage and metadata tracking
const processItem = (item: any, itemNumber: number) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    // Extract and upsert chat information
    const chatInfo = extractChatInfo(item);
    if (chatInfo) {
      yield* db.upsertChat(chatInfo);
    }

    // Extract and upsert user information
    const userInfo = extractUserInfo(item);
    if (userInfo) {
      yield* db.upsertUser(userInfo);
    }

    // Convert and insert message item into database
    const dbItem = convertToDbItem(item);
    const itemId = yield* db.insertItem(dbItem);

    if (itemId === 0) {
      // Duplicate item, skip processing
      console.log(`${itemNumber}. Duplicate message skipped: ${item.externalId}`);
      return;
    }

    // Check for bot commands and enqueue for processing
    const commands = detectBotCommands(item.content);
    for (const command of commands) {
      yield* db.enqueueProcessing(itemId, command as any);
      console.log(`🤖 Queued ${command} command for processing: ${item.externalId}`);
    }

    // Console output for monitoring
    const messageId = item.externalId || 'unknown';
    const timestamp = item.createdAt || new Date().toISOString();
    const username = item.authors?.[0]?.username || item.authors?.[0]?.displayName || 'unknown';
    const chatTitle = dbItem.chatTitle ? ` in "${dbItem.chatTitle}"` : '';
    const commandIndicator = commands.length > 0 ? ' 🤖' : '';

    console.log(`${itemNumber}. @${username} (${messageId}) - ${timestamp}${chatTitle}${commandIndicator}`);
  });

// State persistence using database (adapted for Telegram's update_id system)
const saveState = (state: any) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    yield* db.saveStreamState({
      phase: state.phase,
      lastUpdateId: state.lastUpdateId,
      totalProcessed: state.totalProcessed,
      nextPollMs: state.nextPollMs,
      chatId: state.chatId,
    });
  });

const loadState = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const state = yield* db.loadStreamState();

    if (!state) return null;

    // Convert database state back to plugin state format
    return {
      phase: state.phase,
      lastUpdateId: state.lastUpdateId,
      totalProcessed: state.totalProcessed,
      nextPollMs: state.nextPollMs,
      chatId: state.chatId,
    };
  });

// Main streaming program with Telegram bot integration
const program = Effect.gen(function* () {
  // Install signal handlers for graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down Telegram bot gracefully...');
    runtime.runPromise(Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      yield* pluginRuntime.shutdown();
    }).pipe(Effect.provide(runtime))).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('🤖 Starting Telegram bot with database storage...\n');

  // Load initial state from database
  const initialState = yield* loadState();

  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} messages total)`);
  } else {
    console.log('📂 Starting fresh message collection');
  }

  // Create streaming pipeline for Telegram messages
  const pluginRuntime = yield* PluginRuntime;

  const stream = yield* pluginRuntime.streamPlugin(
    "@curatedotfun/telegram-source",
    {
      variables: {
        timeout: 30000,
        // baseUrl: "https://your-webhook-url.com", // Uncomment for webhook mode
      },
      secrets: { botToken: "{{TELEGRAM_BOT_TOKEN}}" }
    },
    {
      procedure: "search",
      input: {
        chatId: TARGET_CHAT_ID, // Optional: monitor specific chat
        maxResults: 10000, // High limit for long-running collection
        budgetMs: 60000, // 1 minute timeout per batch
        livePollMs: 30000, // Poll every 30 seconds
        includeCommands: true, // Include bot commands
        textOnly: false, // Include media messages with captions
      },
      state: initialState,
    },
    {
      maxInvocations: 1000, // High limit for long-running stream
      onStateChange: (newState: any, items: any[]) =>
        Effect.gen(function* () {
          // Log batch info and save state to database
          if (items.length > 0) {
            const phase = newState.phase || 'unknown';
            const emoji = phase === 'initial' ? '🚀' :
              phase === 'collecting' ? '📥' :
                phase === 'monitoring' ? '👁️' : '📨';
            const chatInfo = newState.chatId ? ` (chat: ${newState.chatId})` : '';
            console.log(`${emoji} Processing ${items.length} messages (${newState.totalProcessed || 0} total, phase: ${phase})${chatInfo}`);
          } else if (newState.phase === 'monitoring') {
            console.log('⏰ No new messages, monitoring for updates...');
          }

          yield* saveState(newState);
        }).pipe(Effect.provide(DatabaseServiceLive))
    }
  );

  // Process each message individually from the stream
  let itemCount = 0;
  yield* stream.pipe(
    Stream.tap((item: any) =>
      Effect.gen(function* () {
        itemCount++;
        yield* processItem(item, itemCount);
      })
    ),
    Stream.runDrain
  );

}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseServiceLive),
  Effect.provide(runtime)
);

// Run the program
console.log('🔧 Make sure to set TELEGRAM_BOT_TOKEN environment variable');
console.log('🔧 Optionally set TELEGRAM_CHAT_ID to monitor a specific chat');
console.log('🔧 Bot must be added to groups/channels to see messages\n');

await runtime.runPromise(program);
