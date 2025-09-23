import type { Update } from "telegraf/types";

// Mock Telegram updates for testing
export const mockTelegramUpdates = {
  textMessage: {
    update_id: 123456,
    message: {
      message_id: 1,
      date: 1640995200, // 2022-01-01 00:00:00 UTC
      text: "Hello bot! This is a test message.",
      chat: {
        id: 12345,
        type: "private",
        first_name: "Test",
        last_name: "User"
      },
      from: {
        id: 67890,
        is_bot: false,
        first_name: "Test",
        last_name: "User",
        username: "testuser",
        language_code: "en"
      }
    }
  } as Update,

  groupMessage: {
    update_id: 123457,
    message: {
      message_id: 2,
      date: 1640995260,
      text: "Group message here!",
      chat: {
        id: -100123456789,
        type: "supergroup",
        title: "Test Group",
        username: "testgroup"
      },
      from: {
        id: 67891,
        is_bot: false,
        first_name: "Group",
        last_name: "User",
        username: "groupuser"
      }
    }
  } as Update,

  botMention: {
    update_id: 123458,
    message: {
      message_id: 3,
      date: 1640995320,
      text: "@testbot please help me with this task",
      chat: {
        id: -100123456789,
        type: "supergroup",
        title: "Test Group",
        username: "testgroup"
      },
      from: {
        id: 67892,
        is_bot: false,
        first_name: "Mention",
        last_name: "User",
        username: "mentionuser"
      },
      entities: [
        {
          type: "mention",
          offset: 0,
          length: 8
        }
      ]
    }
  } as Update,

  replyToBot: {
    update_id: 123459,
    message: {
      message_id: 4,
      date: 1640995380,
      text: "This is a reply to the bot",
      chat: {
        id: 12346,
        type: "private"
      },
      from: {
        id: 67893,
        is_bot: false,
        first_name: "Reply",
        last_name: "User",
        username: "replyuser"
      },
      reply_to_message: {
        message_id: 3,
        date: 1640995320,
        text: "Bot's previous message",
        from: {
          id: 123456789, // Bot's ID
          is_bot: true,
          first_name: "Test",
          username: "testbot"
        },
        chat: {
          id: 12346,
          type: "private"
        }
      }
    }
  } as Update,

  commandMessage: {
    update_id: 123460,
    message: {
      message_id: 5,
      date: 1640995440,
      text: "/start Welcome to the bot!",
      chat: {
        id: 12347,
        type: "private"
      },
      from: {
        id: 67894,
        is_bot: false,
        first_name: "Command",
        last_name: "User",
        username: "commanduser"
      },
      entities: [
        {
          type: "bot_command",
          offset: 0,
          length: 6
        }
      ]
    }
  } as Update,

  mediaMessage: {
    update_id: 123461,
    message: {
      message_id: 6,
      date: 1640995500,
      caption: "Check out this photo!",
      chat: {
        id: 12348,
        type: "private"
      },
      from: {
        id: 67895,
        is_bot: false,
        first_name: "Media",
        last_name: "User",
        username: "mediauser"
      },
      photo: [
        {
          file_id: "AgACAgIAAxkBAAICBmH...",
          file_unique_id: "AQADyBwAAqm7kEly",
          width: 320,
          height: 240,
          file_size: 12345
        }
      ]
    }
  } as Update,

  channelPost: {
    update_id: 123462,
    channel_post: {
      message_id: 7,
      date: 1640995560,
      text: "Channel announcement!",
      chat: {
        id: -1001234567890,
        type: "channel",
        title: "Test Channel",
        username: "testchannel"
      }
    }
  } as Update,

  editedMessage: {
    update_id: 123463,
    edited_message: {
      message_id: 1,
      date: 1640995200,
      edit_date: 1640995620,
      text: "Hello bot! This is an edited test message.",
      chat: {
        id: 12345,
        type: "private",
        first_name: "Test",
        last_name: "User"
      },
      from: {
        id: 67890,
        is_bot: false,
        first_name: "Test",
        last_name: "User",
        username: "testuser"
      }
    }
  } as Update,

  callbackQuery: {
    update_id: 123464,
    callback_query: {
      id: "callback123",
      from: {
        id: 67896,
        is_bot: false,
        first_name: "Callback",
        last_name: "User",
        username: "callbackuser"
      },
      message: {
        message_id: 8,
        date: 1640995680,
        text: "Choose an option:",
        chat: {
          id: 12349,
          type: "private"
        },
        from: {
          id: 123456789,
          is_bot: true,
          first_name: "Test",
          username: "testbot"
        }
      },
      data: "option_1"
    }
  } as Update
};

// Mock bot info for testing
export const mockBotInfo = {
  id: 123456789,
  is_bot: true,
  first_name: "Test",
  username: "testbot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false
};

// Helper to create custom updates
export function createMockUpdate(overrides: Partial<Update> = {}): Update {
  return {
    ...mockTelegramUpdates.textMessage,
    ...overrides
  };
}

// Helper to create message updates with specific properties
export function createMockMessage(
  text: string,
  chatId: number = 12345,
  chatType: "private" | "group" | "supergroup" | "channel" = "private",
  userId: number = 67890,
  username?: string
): Update {
  return {
    update_id: Math.floor(Math.random() * 1000000),
    message: {
      message_id: Math.floor(Math.random() * 1000),
      date: Math.floor(Date.now() / 1000),
      text,
      chat: {
        id: chatId,
        type: chatType,
        ...(chatType !== "private" && { title: "Test Chat" }),
        ...(username && { username })
      },
      from: {
        id: userId,
        is_bot: false,
        first_name: "Test",
        last_name: "User",
        ...(username && { username })
      }
    }
  } as Update;
}
