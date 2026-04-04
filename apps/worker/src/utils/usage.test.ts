import { describe, expect, it, vi } from "vitest";

vi.mock("../wasm/core", () => ({
	normalizeUsageViaWasm: () => null,
	parseUsageFromJsonViaWasm: () => null,
	parseUsageFromSseLineViaWasm: () => null,
}));

import { parseUsageFromSse } from "./usage";

function createSseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			},
		}),
		{
			headers: {
				"content-type": "text/event-stream",
			},
		},
	);
}

describe("parseUsageFromSse", () => {
	it("detects delayed stream error payloads in lite mode", async () => {
		const response = createSseResponse([
			": keep-alive\n\n",
			"event: error\n",
			'data: {"error":{"type":"rate_limit_error","message":"Concurrency limit exceeded for user"}}\n\n',
		]);

		const result = await parseUsageFromSse(response, { mode: "lite" });

		expect(result.abnormal?.errorCode).toBe("upstream_stream_error_payload");
		expect(result.abnormal?.errorMessage).toContain("rate_limit_error");
		expect(result.eventsSeen).toBe(1);
	});

	it("keeps off mode as pure pass-through parsing", async () => {
		const response = createSseResponse([
			"event: error\n",
			'data: {"error":{"type":"rate_limit_error","message":"Concurrency limit exceeded for user"}}\n\n',
		]);

		const result = await parseUsageFromSse(response, { mode: "off" });

		expect(result.abnormal).toBeNull();
		expect(result.usage).toBeNull();
		expect(result.eventsSeen).toBeUndefined();
	});

	it("detects response.failed payloads without requiring an event header", async () => {
		const response = createSseResponse([
			'data: {"type":"response.failed","error":{"code":"server_error","message":"upstream failed"}}\n\n',
		]);

		const result = await parseUsageFromSse(response, { mode: "full" });

		expect(result.abnormal?.errorCode).toBe("upstream_stream_error_payload");
		expect(result.abnormal?.errorMessage).toContain("response.failed");
		expect(result.eventsSeen).toBe(1);
	});
});
