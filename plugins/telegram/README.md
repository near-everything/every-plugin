# Telegram Plugin

A plugin for connecting to the Telegram Bot API to send and receive messages in real-time.

## Features

- **Dual Mode Support**: Choose between polling (simple setup) or webhook (production-ready)
- **Real-time Streaming**: Stream messages with advanced filtering by chat ID, message type, chat type, and commands
- **Message Sending**: Send text messages with optional reply markup and formatting
- **Error Handling**: Robust error handling with CommonPluginErrors
- **Auto-cleanup**: Proper resource management and cleanup on plugin shutdown

## Installation

Add to your every-plugin registry:

```javascript
const registry = {
  "@curatedotfun/telegram": {
    remoteUrl: "https://cdn.example.com/plugins/telegram/remoteEntry.js", // Replace with actual URL
    version: "1.0.0"
  }
};
```

## Usage

### Polling Mode (Simple Setup)

For development or simple use cases, use polling mode which doesn't require a public URL:

```typescript
const { client } = await runtime.usePlugin("@curatedotfun/telegram", {
  secrets: { botToken: "{{TELEGRAM_BOT_TOKEN}}" }
});

// Send a message
const result = await client.sendMessage({
  chatId: "123456789",
  text: "Hello from the plugin!"
});

// Listen to all messages in a specific chat
for await (const update of client.listen({
  chatId: "123456789"
})) {
  console.log("New message:", update.message?.text);
}
```

### Webhook Mode (Production)

For production deployments, use webhook mode which provides better performance and reliability:

```typescript
const { client } = await runtime.usePlugin("@curatedotfun/telegram", {
  variables: { domain: "https://your-domain.com" },
  secrets: {
    botToken: "{{TELEGRAM_BOT_TOKEN}}",
    webhookToken: "{{WEBHOOK_SECRET_TOKEN}}"  // Optional: Additional security
  }
});
```

## Configuration

### Required Secrets

- **`botToken`** *(string)*: Your Telegram bot token from [@BotFather](https://t.me/botfather)

### Optional Variables

- **`domain`** *(string)*: Your public domain URL for webhook mode (e.g., `https://api.example.com`)
- **`timeout`** *(number, default: 30000)*: Request timeout in milliseconds

### Optional Secrets

- **`webhookToken`** *(string)*: Secret token for webhook validation (enhanced security)

## Examples

### Basic Message Sending

```typescript
const result = await client.sendMessage({
  chatId: "123456789",
  text: "Hello, World!",
  parseMode: "HTML"  // Optional: HTML, Markdown, or MarkdownV2
});

console.log(`Message sent with ID: ${result.messageId}`);
```

### Reply to a Message

```typescript
const result = await client.sendMessage({
  chatId: "123456789",
  text: "This is a reply!",
  replyToMessageId: 987654321
});
```

### Stream Messages with Filtering

```typescript
// Listen to all text messages in a group chat
for await (const update of client.listen({
  chatId: "123456789",
  messageTypes: ["text"],
  chatTypes: ["group"]
})) {
  console.log(`Message from ${update.from?.username}: ${update.message?.text}`);
}
```

### Command Handling

```typescript
// Listen only for specific commands
for await (const update of client.listen({
  commands: ["/start", "/help", "/ping"]
})) {
  const command = update.message?.text?.split(" ")[0];

  switch (command) {
    case "/start":
      await client.sendMessage({
        chatId: update.chat?.id?.toString()!,
        text: "Welcome! Use /help for more info."
      });
      break;

    case "/ping":
      await client.sendMessage({
        chatId: update.chat?.id?.toString()!,
        text: "Pong! ✅"
      });
      break;
  }
}
```

### Advanced Filtering

```typescript
// Listen to multiple message types with limits
for await (const update of client.listen({
  messageTypes: ["text", "photo", "document", "video"],
  chatTypes: ["private", "group"],
  maxResults: 100  // Stop after 100 messages
})) {
  console.log(`Received ${update.updateType} from chat type: ${update.chat?.type}`);
}
```

### Webhook Processing

If using webhook mode, mount the router to handle incoming webhooks from Telegram:

```typescript
import { OpenAPIHandler } from "@orpc/openapi/node";

// Initialize plugin in webhook mode
const { router, initialized } = await runtime.usePlugin("@curatedotfun/telegram", {
  variables: { domain: "https://your-domain.com" },
  secrets: {
    botToken: "{{BOT_TOKEN}}",
    webhookToken: "{{WEBHOOK_SECRET_TOKEN}}"
  }
});

// Create OpenAPI handler for the router
const handler = new OpenAPIHandler(router);

// Mount webhook endpoint with OpenAPI handler
app.post('/telegram/webhook', async (req, res) => {
  const result = await handler.handle(req, res, {
    prefix: '/telegram',
    context: initialized.context
  });

  if (!result.matched) {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

// Alternative: Direct webhook processing
const { client } = await runtime.usePlugin("@curatedotfun/telegram", {...});

// In your webhook endpoint
app.post('/telegram/webhook', async (req, res) => {
  const result = await client.webhook(req.body);
  res.json(result);
});
```

## Message Types Supported

The plugin can filter by these message types:
- `text` - Text messages (includes commands if commands filter is used)
- `photo` - Messages with photos
- `document` - File documents
- `video` - Video messages
- `voice` - Voice messages
- `audio` - Audio files
- `sticker` - Sticker messages
- `location` - Location messages
- `contact` - Contact information
- `animation` - GIF/animation messages
- `video_note` - Video notes

## Chat Types Supported

Filter messages by chat type:
- `private` - Private one-on-one chats
- `group` - Group chats
- `supergroup` - Large group chats
- `channel` - Channel posts

## Error Handling

The plugin uses standard CommonPluginErrors:

- **`UNAUTHORIZED`** - Invalid bot token
- **`FORBIDDEN`** - Bot lacks required permissions
- **`BAD_REQUEST`** - Invalid request parameters
- **`NOT_FOUND`** - Chat or resource not found
- **`SERVICE_UNAVAILABLE`** - Telegram API rate limits or outages

## Best Practices

### Polling vs Webhook

- **Use Polling** for development, testing, or simple integrations
- **Use Webhook** for production deployments with high traffic

### Error Handling

```typescript
try {
  const result = await client.sendMessage({
    chatId: chatId,
    text: message
  });
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    console.error('Bot token is invalid');
  } else if (error.code === 'SERVICE_UNAVAILABLE') {
    console.error('Rate limited, retry after:', error.data?.retryAfter, 'seconds');
  }
}
```

### Resource Management

The plugin handles cleanup automatically, but be mindful of:
- Long-running streams: Use `maxResults` to prevent infinite loops in development
- Error handling: Always wrap API calls in try-catch blocks

## Required Permissions

Your bot needs appropriate permissions based on what you want to do:

- **Send Messages**: Basic messaging capability
- **Read Messages**: For listening in groups/channels
- **Admin Rights**: For managing group settings (if needed)

Set permissions when creating your bot with [@BotFather](https://t.me/botfather).

## Troubleshooting

### Bot Not Responding
- Verify your `botToken` is correct
- Check bot permissions in the chat/group
- Ensure the bot is added to the chat

### Webhook Issues
- Verify `domain` is publicly accessible
- Check webhook URL format: `${domain}/telegram/webhook`
- Ensure HTTPS is used (required by Telegram)

### Rate Limiting
- Telegram limits API calls per bot
- Webhook mode is more efficient than polling
- Implement exponential backoff in your application logic

## Development

For plugin developers building integrations, see [./LLM.txt](./LLM.txt) for detailed technical documentation on the plugin architecture and API.
