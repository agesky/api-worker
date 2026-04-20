import { describe, expect, it } from "vitest";
import { buildOpenAiModelListPayload } from "./openai-model-list";

describe("buildOpenAiModelListPayload", () => {
	it("returns unique models in OpenAI list format", () => {
		expect(
			buildOpenAiModelListPayload(["gpt-4.1", " gpt-5.4 ", "gpt-4.1", ""]),
		).toEqual({
			object: "list",
			data: [
				{
					id: "gpt-4.1",
					object: "model",
					created: 0,
					owned_by: "api-worker",
				},
				{
					id: "gpt-5.4",
					object: "model",
					created: 0,
					owned_by: "api-worker",
				},
			],
		});
	});
});
