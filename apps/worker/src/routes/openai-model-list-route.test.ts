import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../env";

vi.mock("../wasm/core", () => ({
	createWeightedOrderIndicesViaWasm: (weights: number[]) =>
		weights.map((_, index) => index),
}));

type MockStatement = {
	bind: (...bindings: unknown[]) => MockStatement;
	first: <T>() => Promise<T | null>;
	all: <T>() => Promise<{ results: T[] }>;
};

function createMockDb() {
	const createStatement = (
		sql: string,
		bindings: unknown[] = [],
	): MockStatement => ({
		bind: (...nextBindings: unknown[]) => createStatement(sql, nextBindings),
		first: async <T>() => {
			if (sql.includes("FROM tokens")) {
				return {
					id: "token-1",
					name: "Token 1",
					quota_total: null,
					quota_used: 0,
					status: "active",
					allowed_channels: JSON.stringify(["channel-1"]),
					expires_at: null,
				} as T;
			}
			return null;
		},
		all: async <T>() => {
			if (sql.includes("FROM channels")) {
				expect(bindings).toEqual(["active", expect.any(Number)]);
				return {
					results: [
						{
							id: "channel-1",
							name: "Channel 1",
							base_url: "https://upstream-1.example",
							api_key: "key-1",
							weight: 1,
							status: "active",
							models_json: JSON.stringify([{ id: "gpt-4.1" }]),
						},
						{
							id: "channel-2",
							name: "Channel 2",
							base_url: "https://upstream-2.example",
							api_key: "key-2",
							weight: 1,
							status: "active",
							models_json: JSON.stringify([{ id: "gpt-5.4" }]),
						},
					] as T[],
				};
			}
			if (sql.includes("channel_model_capabilities")) {
				return { results: [] as T[] };
			}
			return { results: [] as T[] };
		},
	});

	return {
		prepare: (sql: string) => createStatement(sql),
	};
}

async function createApp() {
	const { default: proxyRoutes } = await import("./proxy");
	const app = new Hono<AppEnv>();
	app.route("/v1", proxyRoutes);
	return app;
}

describe("GET /v1/models", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns local OpenAI model list without calling upstream", async () => {
		const upstreamFetch = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("upstream should not be called"));
		const app = await createApp();
		const response = await app.fetch(
			new Request("https://worker.example/v1/models", {
				headers: {
					Authorization: "Bearer test-token",
				},
			}),
			{
				DB: createMockDb(),
				CHECKIN_SCHEDULER: {},
			} as AppEnv["Bindings"],
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			object: "list",
			data: [
				{
					id: "gpt-4.1",
					object: "model",
					created: 0,
					owned_by: "api-worker",
				},
			],
		});
		expect(upstreamFetch).not.toHaveBeenCalled();
	});
});
