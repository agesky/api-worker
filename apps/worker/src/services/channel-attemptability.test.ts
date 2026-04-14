import { describe, expect, it } from "vitest";
import { resolveChannelAttemptTarget } from "./channel-attemptability";
import type { ChannelRecord } from "./channel-types";
import type { CallTokenItem } from "./call-token-selector";

function createChannel(overrides: Partial<ChannelRecord> = {}): ChannelRecord {
	return {
		id: "channel-1",
		name: "Channel 1",
		base_url: "https://example.com",
		api_key: "channel-key",
		weight: 1,
		status: "active",
		metadata_json: null,
		...overrides,
	};
}

function createToken(overrides: Partial<CallTokenItem> = {}): CallTokenItem {
	return {
		id: "token-1",
		channel_id: "channel-1",
		name: "Token 1",
		api_key: "token-key",
		models_json: null,
		...overrides,
	};
}

describe("resolveChannelAttemptTarget", () => {
	it("rejects channels when all call tokens explicitly exclude the model", () => {
		const channel = createChannel();
		const token = createToken({
			models_json: JSON.stringify(["gpt-4.1"]),
		});

		const result = resolveChannelAttemptTarget({
			channel,
			tokens: [token],
			downstreamModel: "gpt-5.4",
			verifiedModelsByChannel: new Map([[channel.id, new Set(["gpt-5.4"])]]),
			endpointType: "chat",
			downstreamProvider: "openai",
		});

		expect(result.eligible).toBe(false);
		expect(result.reason).toBe("no_matching_call_token");
	});

	it("allows channels to fall back to unscoped call tokens", () => {
		const channel = createChannel();
		const token = createToken({
			id: "token-2",
			models_json: null,
		});

		const result = resolveChannelAttemptTarget({
			channel,
			tokens: [token],
			downstreamModel: "gpt-5.4",
			verifiedModelsByChannel: new Map([[channel.id, new Set(["gpt-5.4"])]]),
			endpointType: "chat",
			downstreamProvider: "openai",
		});

		expect(result.eligible).toBe(true);
		expect(result.reason).toBeNull();
		expect(result.tokenSelection.token?.id).toBe("token-2");
	});

	it("rejects passthrough requests when the provider does not match", () => {
		const channel = createChannel({
			metadata_json: JSON.stringify({ site_type: "anthropic" }),
		});

		const result = resolveChannelAttemptTarget({
			channel,
			tokens: [],
			downstreamModel: null,
			endpointType: "passthrough",
			downstreamProvider: "openai",
		});

		expect(result.eligible).toBe(false);
		expect(result.reason).toBe("passthrough_provider_mismatch");
	});
});
