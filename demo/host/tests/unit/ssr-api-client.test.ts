import { describe, expect, it, vi } from "vitest";
import {
	installSsrApiClientGlobal,
	runWithSsrApiClient,
} from "@/services/ssr-api-client";

import { apiClient } from "../../../ui/src/utils/orpc";

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("SSR apiClient injection", () => {
	it("uses AsyncLocalStorage store over global override", async () => {
		installSsrApiClientGlobal();

		const baseClient = {
			getValue: vi.fn().mockResolvedValue({ key: "k", value: "base" }),
		};
		const scopedClient = {
			getValue: vi.fn().mockResolvedValue({ key: "k", value: "scoped" }),
		};

		(globalThis as any).$apiClient = baseClient;
		expect((globalThis as any).$apiClient).toBe(baseClient);

		const result = await runWithSsrApiClient(scopedClient, async () => {
			await new Promise((r) => setTimeout(r, 0));
			return apiClient.getValue({ key: "k" });
		});

		expect(result).toEqual({ key: "k", value: "scoped" });
		expect((globalThis as any).$apiClient).toBe(baseClient);
		expect(scopedClient.getValue).toHaveBeenCalledWith({ key: "k" });
		expect(baseClient.getValue).not.toHaveBeenCalled();
	});

	it("does not leak across concurrent runs", async () => {
		installSsrApiClientGlobal();
		const baseClient = {
			getValue: vi.fn().mockResolvedValue({ key: "k", value: "base" }),
		};
		const clientA = {
			getValue: vi.fn().mockResolvedValue({ key: "k", value: "A" }),
		};
		const clientB = {
			getValue: vi.fn().mockResolvedValue({ key: "k", value: "B" }),
		};
		(globalThis as any).$apiClient = baseClient;

		const p1 = runWithSsrApiClient(clientA, async () => {
			await new Promise((r) => setTimeout(r, 10));
			return apiClient.getValue({ key: "k" });
		});

		const p2 = runWithSsrApiClient(clientB, async () => {
			await new Promise((r) => setTimeout(r, 0));
			return apiClient.getValue({ key: "k" });
		});

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toEqual({ key: "k", value: "A" });
		expect(r2).toEqual({ key: "k", value: "B" });
		expect((globalThis as any).$apiClient).toBe(baseClient);

		expect(clientA.getValue).toHaveBeenCalledWith({ key: "k" });
		expect(clientB.getValue).toHaveBeenCalledWith({ key: "k" });
		expect(baseClient.getValue).not.toHaveBeenCalled();
	});
});
