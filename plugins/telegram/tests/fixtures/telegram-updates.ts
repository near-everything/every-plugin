import type { Update } from "telegraf/types";

export const createMockUpdate = (overrides: Partial<Update> = {}): Update => ({
	update_id: Math.floor(Math.random() * 1000000),
	message: {
		message_id: Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		text: "Test message",
		chat: {
			id: -4956736324,
			type: "supergroup" as const,
			title: "Test Group",
		},
		from: {
			id: 12345,
			is_bot: false,
			first_name: "Test",
			last_name: "User",
			username: "testuser",
		},
	},
	...overrides,
});

export const createTextUpdate = (
	text: string,
	chatId: number = -4956736324,
): Update =>
	createMockUpdate({
		message: {
			message_id: Math.floor(Math.random() * 1000),
			date: Math.floor(Date.now() / 1000),
			text,
			chat: {
				id: chatId,
				type: "supergroup" as const,
				title: "Test Group",
			},
			from: {
				id: 12345,
				is_bot: false,
				first_name: "Test",
				last_name: "User",
				username: "testuser",
			},
		},
	});

export const createCommandUpdate = (
	command: string,
	chatId: number = -4956736324,
): Update => createTextUpdate(command, chatId);

export const createMediaUpdate = (
	caption: string,
	chatId: number = -4956736324,
): Update =>
	createMockUpdate({
		message: {
			message_id: Math.floor(Math.random() * 1000),
			date: Math.floor(Date.now() / 1000),
			caption,
			chat: {
				id: chatId,
				type: "supergroup" as const,
				title: "Test Group",
			},
			from: {
				id: 12345,
				is_bot: false,
				first_name: "Test",
				last_name: "User",
				username: "testuser",
			},
			photo: [
				{
					file_id: "photo123",
					file_unique_id: "unique123",
					width: 100,
					height: 100,
					file_size: 1000,
				},
			],
		},
	});

export const createPrivateChatUpdate = (
	text: string,
	userId: number = 1893641782,
): Update =>
	createMockUpdate({
		message: {
			message_id: Math.floor(Math.random() * 1000),
			date: Math.floor(Date.now() / 1000),
			text,
			chat: {
				id: userId,
				type: "private" as const,
				first_name: "Private",
				last_name: "User",
			},
			from: {
				id: userId,
				is_bot: false,
				first_name: "Private",
				last_name: "User",
				username: "privateuser",
			},
		},
	});
