import {
	parseChannelMetadata,
	resolveProvider,
	type ChannelMetadata,
	type ProviderType,
} from "./channel-metadata";
import { resolveUpstreamModelForChannel } from "./channel-routing";
import type { ChannelRecord } from "./channel-types";
import type { CallTokenItem } from "./call-token-selector";
import type { EndpointType } from "./provider-transform";

export type ChannelAttemptSkipReason =
	| "missing_upstream_model"
	| "gemini_requires_model"
	| "passthrough_provider_mismatch"
	| "no_matching_call_token";

export type CallTokenSelection = {
	token: CallTokenItem | null;
	hasModelList: boolean;
};

export type ChannelAttemptTarget = {
	channel: ChannelRecord;
	metadata: ChannelMetadata;
	upstreamProvider: ProviderType;
	upstreamModel: string | null;
	recordModel: string | null;
	tokenSelection: CallTokenSelection;
	eligible: boolean;
	reason: ChannelAttemptSkipReason | null;
};

function normalizeTokenModels(raw?: string | null): string[] | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0) {
			return null;
		}
		const models = parsed
			.map((item) => String(item ?? "").trim())
			.filter((item) => item.length > 0);
		return models.length > 0 ? models : null;
	} catch {
		return null;
	}
}

function hashSelectionSeed(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}
	return hash;
}

function pickTokenBySelectionKey(
	tokens: CallTokenItem[],
	selectionKey: string | null | undefined,
	selectionOffset = 0,
): CallTokenItem | null {
	if (tokens.length === 0) {
		return null;
	}
	const safeOffset = Number.isFinite(selectionOffset)
		? Math.max(0, Math.floor(selectionOffset))
		: 0;
	if (!selectionKey) {
		return tokens[safeOffset % tokens.length] ?? tokens[0] ?? null;
	}
	const index =
		(hashSelectionSeed(selectionKey) + safeOffset) % Math.max(1, tokens.length);
	return tokens[index] ?? tokens[0] ?? null;
}

export function selectTokenForModel(
	tokens: CallTokenItem[],
	model: string | null,
	selectionKey?: string | null,
	selectionOffset = 0,
): CallTokenSelection {
	if (tokens.length === 0) {
		return { token: null, hasModelList: false };
	}
	if (!model) {
		return {
			token: pickTokenBySelectionKey(tokens, selectionKey, selectionOffset),
			hasModelList: false,
		};
	}
	const tokensWithModels = tokens.map((token) => ({
		token,
		models: normalizeTokenModels(token.models_json),
	}));
	const hasModelList = tokensWithModels.some((entry) => entry.models);
	if (!hasModelList) {
		return {
			token: pickTokenBySelectionKey(tokens, selectionKey, selectionOffset),
			hasModelList: false,
		};
	}
	const matchedTokens = tokensWithModels
		.filter((entry) => entry.models?.includes(model))
		.map((entry) => entry.token);
	if (matchedTokens.length > 0) {
		return {
			token: pickTokenBySelectionKey(
				matchedTokens,
				selectionKey,
				selectionOffset,
			),
			hasModelList,
		};
	}
	const unscopedTokens = tokensWithModels
		.filter((entry) => !entry.models)
		.map((entry) => entry.token);
	if (unscopedTokens.length > 0) {
		return {
			token: pickTokenBySelectionKey(
				unscopedTokens,
				selectionKey,
				selectionOffset,
			),
			hasModelList,
		};
	}
	return { token: null, hasModelList };
}

export function resolveChannelAttemptTarget(options: {
	channel: ChannelRecord;
	tokens: CallTokenItem[];
	downstreamModel: string | null;
	verifiedModelsByChannel?: Map<string, Set<string>>;
	endpointType: EndpointType;
	downstreamProvider: ProviderType;
	selectionKey?: string | null;
	selectionOffset?: number;
}): ChannelAttemptTarget {
	const metadata = parseChannelMetadata(options.channel.metadata_json);
	const upstreamProvider = resolveProvider(metadata.site_type);
	const resolvedModel = resolveUpstreamModelForChannel(
		options.channel,
		metadata,
		options.downstreamModel,
		options.verifiedModelsByChannel ?? new Map<string, Set<string>>(),
	);
	const upstreamModel = resolvedModel.model;
	const recordModel = upstreamModel ?? options.downstreamModel;
	const tokenSelection = selectTokenForModel(
		options.tokens,
		recordModel,
		options.selectionKey,
		options.selectionOffset,
	);
	if (options.endpointType === "passthrough") {
		if (upstreamProvider !== options.downstreamProvider) {
			return {
				channel: options.channel,
				metadata,
				upstreamProvider,
				upstreamModel,
				recordModel,
				tokenSelection,
				eligible: false,
				reason: "passthrough_provider_mismatch",
			};
		}
	}
	if (!upstreamModel && options.downstreamModel) {
		return {
			channel: options.channel,
			metadata,
			upstreamProvider,
			upstreamModel,
			recordModel,
			tokenSelection,
			eligible: false,
			reason: "missing_upstream_model",
		};
	}
	if (
		upstreamProvider === "gemini" &&
		!upstreamModel &&
		options.endpointType !== "passthrough"
	) {
		return {
			channel: options.channel,
			metadata,
			upstreamProvider,
			upstreamModel,
			recordModel,
			tokenSelection,
			eligible: false,
			reason: "gemini_requires_model",
		};
	}
	if (!tokenSelection.token && tokenSelection.hasModelList && recordModel) {
		return {
			channel: options.channel,
			metadata,
			upstreamProvider,
			upstreamModel,
			recordModel,
			tokenSelection,
			eligible: false,
			reason: "no_matching_call_token",
		};
	}
	return {
		channel: options.channel,
		metadata,
		upstreamProvider,
		upstreamModel,
		recordModel,
		tokenSelection,
		eligible: true,
		reason: null,
	};
}
