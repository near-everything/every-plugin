#!/usr/bin/env bun

import { Effect, Logger, LogLevel } from "effect";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";

// Simple database inspection utility for Telegram bot data
const inspectDatabase = Effect.gen(function* () {
  const db = yield* DatabaseService;
  
  console.log("📊 Telegram Bot Database Inspection\n");
  
  // Get recent messages from all chats
  console.log("📝 Recent Messages (last 10):");
  
  // Get stream state
  const streamState = yield* db.loadStreamState();
  if (streamState) {
    console.log("🔄 Stream State:");
    console.log(`   Phase: ${streamState.phase}`);
    console.log(`   Total Processed: ${streamState.totalProcessed}`);
    console.log(`   Last Update ID: ${streamState.lastUpdateId}`);
    console.log(`   Chat ID: ${streamState.chatId || 'All chats'}`);
    console.log(`   Next Poll: ${streamState.nextPollMs}ms`);
    console.log(`   Updated: ${streamState.updatedAt}\n`);
  } else {
    console.log("❌ No stream state found\n");
  }
  
  // Show available inspection commands
  console.log("🔍 Available Inspection Commands:");
  console.log("   To inspect specific chat: TELEGRAM_CHAT_ID=<chat_id> bun inspect-db.ts");
  console.log("   To inspect specific user: TELEGRAM_USER=<username> bun inspect-db.ts");
  console.log("");
  
  // Check for specific chat inspection
  const targetChatId = Bun.env.TELEGRAM_CHAT_ID;
  if (targetChatId) {
    console.log(`💬 Messages from Chat ID: ${targetChatId}`);
    const chatMessages = yield* db.getItemsByChatId(targetChatId, 10);
    if (chatMessages.length > 0) {
      chatMessages.forEach((item, i) => {
        const timestamp = new Date(item.createdAt || '').toLocaleString();
        const username = item.originalAuthorUsername || item.originalAuthorDisplayName || 'unknown';
        const commandIndicator = item.isCommand ? ' 🤖' : '';
        console.log(`  ${i + 1}. @${username} (${item.messageId}) - ${timestamp}${commandIndicator}`);
        console.log(`     "${item.content.substring(0, 80)}${item.content.length > 80 ? '...' : ''}"`);
        console.log(`     Chat: ${item.chatTitle || item.chatId}, Type: ${item.chatType}\n`);
      });
    } else {
      console.log("   No messages found for this chat\n");
    }
  }
  
  // Check for specific user inspection
  const targetUser = Bun.env.TELEGRAM_USER;
  if (targetUser) {
    console.log(`👤 Messages from User: @${targetUser}`);
    const userMessages = yield* db.getItemsByUsername(targetUser, 10);
    if (userMessages.length > 0) {
      userMessages.forEach((item, i) => {
        const timestamp = new Date(item.createdAt || '').toLocaleString();
        const commandIndicator = item.isCommand ? ' 🤖' : '';
        console.log(`  ${i + 1}. ${item.messageId} - ${timestamp}${commandIndicator}`);
        console.log(`     "${item.content.substring(0, 80)}${item.content.length > 80 ? '...' : ''}"`);
        console.log(`     Chat: ${item.chatTitle || item.chatId}, Type: ${item.chatType}\n`);
      });
    } else {
      console.log("   No messages found for this user\n");
    }
  }
  
  // Show database statistics
  console.log("📈 Database Statistics:");
  console.log("   Use SQL queries to get detailed statistics:");
  console.log("   - Total messages: SELECT COUNT(*) FROM items;");
  console.log("   - Messages by chat: SELECT chat_title, COUNT(*) FROM items GROUP BY chat_id;");
  console.log("   - Messages by user: SELECT original_author_username, COUNT(*) FROM items GROUP BY original_author_id;");
  console.log("   - Commands: SELECT COUNT(*) FROM items WHERE is_command = 1;");
  console.log("   - Recent activity: SELECT * FROM items ORDER BY ingested_at DESC LIMIT 10;");
  console.log("");
  
  console.log("💡 Tips:");
  console.log("   - Set TELEGRAM_CHAT_ID to inspect a specific chat");
  console.log("   - Set TELEGRAM_USER to inspect a specific user's messages");
  console.log("   - Use database.sqlite with any SQLite client for detailed queries");
  console.log("   - Check processing_queue table for pending bot commands");
});

// Main program
const program = inspectDatabase.pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseServiceLive)
);

// Run the inspection
await Effect.runPromise(program);
