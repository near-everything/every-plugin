export class TemplateClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
	}

	async healthCheck(): Promise<string> {
		return "OK";
	}
}
