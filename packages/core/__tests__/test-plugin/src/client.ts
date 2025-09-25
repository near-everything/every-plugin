import { z } from "zod";

export const testItemSchema = z.object({
	externalId: z.string(),
	content: z.string(),
	raw: z.unknown(), // Original API response
});

export type TestItem = z.infer<typeof testItemSchema>;

export function createTestItem(id: string, prefix: string = "item"): TestItem {
	return {
		externalId: id,
		content: `${prefix} content for ${id}`,
		raw: { id, prefix, type: "test" },
	};
}

export class TestClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
	}

	async healthCheck(): Promise<string> {
		return "OK";
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	isInitialized(): boolean {
		return !!this.apiKey && !!this.baseUrl;
	}

	// Context-aware methods that can be used by handlers
	async fetchById(id: string, prefix: string = "single"): Promise<TestItem> {
		if (!this.isInitialized()) {
			throw new Error("Client not initialized");
		}
		return createTestItem(id, prefix);
	}

	async fetchBulk(ids: string[], prefix: string = "bulk"): Promise<TestItem[]> {
		if (!this.isInitialized()) {
			throw new Error("Client not initialized");
		}
		return ids.map(id => createTestItem(id, prefix));
	}

	async *streamItems(count: number, prefix: string = "item"): AsyncGenerator<{
		item: TestItem;
		state: { nextPollMs: number | null; lastId: string };
		metadata: { itemIndex: number };
	}> {
		if (!this.isInitialized()) {
			throw new Error("Client not initialized");
		}

		for (let i = 0; i < count; i++) {
			const item = createTestItem(`${prefix}_${i}`, prefix);

			yield {
				item,
				state: {
					nextPollMs: null,
					lastId: item.externalId,
				},
				metadata: {
					itemIndex: i,
				}
			};

			// Small delay for testing
			await new Promise(resolve => setTimeout(resolve, 5));
		}
	}

	getConfigValue(): string {
		return this.baseUrl;
	}
}
