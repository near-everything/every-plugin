import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mockBotInfo } from './fixtures/telegram-updates';

// Mock Telegram Bot API responses
const mockTelegramResponses = {
  getMe: {
    ok: true,
    result: mockBotInfo
  },
  setWebhook: {
    ok: true,
    result: true,
    description: "Webhook was set"
  },
  sendMessage: {
    ok: true,
    result: {
      message_id: 123,
      date: Math.floor(Date.now() / 1000),
      text: "Test response message",
      chat: {
        id: 12345,
        type: "private",
        first_name: "Test",
        last_name: "User"
      },
      from: {
        id: 123456789,
        is_bot: true,
        first_name: "Test",
        username: "testbot"
      }
    }
  },
  deleteWebhook: {
    ok: true,
    result: true,
    description: "Webhook was deleted"
  }
};

// MSW server setup for Telegram Bot API
export const server = setupServer(
  // Get bot info
  http.get('https://api.telegram.org/bot*/getMe', () => {
    return HttpResponse.json(mockTelegramResponses.getMe);
  }),

  // Set webhook
  http.post('https://api.telegram.org/bot*/setWebhook', async ({ request }) => {
    try {
      const body = await request.json() as any;
      console.log('MSW: setWebhook called with:', body);
      return HttpResponse.json(mockTelegramResponses.setWebhook);
    } catch {
      return HttpResponse.json(mockTelegramResponses.setWebhook);
    }
  }),

  // Delete webhook
  http.post('https://api.telegram.org/bot*/deleteWebhook', () => {
    return HttpResponse.json(mockTelegramResponses.deleteWebhook);
  }),

  // Send message
  http.post('https://api.telegram.org/bot*/sendMessage', async ({ request }) => {
    try {
      const body = await request.json() as any;
      
      // Create response based on request
      const response = {
        ...mockTelegramResponses.sendMessage,
        result: {
          ...mockTelegramResponses.sendMessage.result,
          text: body.text || "Test response message",
          chat: {
            id: parseInt(body.chat_id) || 12345,
            type: "private" as const,
            first_name: "Test",
            last_name: "User"
          },
          ...(body.reply_to_message_id && {
            reply_to_message: {
              message_id: body.reply_to_message_id,
              date: Math.floor(Date.now() / 1000) - 60,
              text: "Original message",
              from: {
                id: parseInt(body.chat_id) || 12345,
                is_bot: false,
                first_name: "Test",
                last_name: "User"
              },
              chat: {
                id: parseInt(body.chat_id) || 12345,
                type: "private" as const
              }
            }
          })
        }
      };

      return HttpResponse.json(response);
    } catch (error) {
      console.log('MSW: Failed to parse sendMessage request body, returning default response');
      return HttpResponse.json(mockTelegramResponses.sendMessage);
    }
  }),

  // Handle other Telegram API methods with generic success response
  http.post('https://api.telegram.org/bot*/*', async ({ request }) => {
    const url = new URL(request.url);
    const method = url.pathname.split('/').pop();
    console.log(`MSW: Unhandled Telegram API method: ${method}`);
    
    return HttpResponse.json({
      ok: true,
      result: true,
      description: `Mock response for ${method}`
    });
  })
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Export mock responses for use in tests
export { mockTelegramResponses };
