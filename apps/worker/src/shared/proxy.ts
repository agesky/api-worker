import { Hono } from "hono";
import {
	detectStreamFlagFromRawJsonRequest,
	extractResponsesRequestHints as extractResponsesRequestHintsShared,
	hasChatToolOutputHint as hasChatToolOutputHintShared,
	hasUnresolvedResponsesFunctionCallOutput as hasUnresolvedResponsesFunctionCallOutputShared,
	isResponsesToolCallNotFoundMessage as isResponsesToolCallNotFoundMessageShared,
	repairOpenAiToolCallChain as repairOpenAiToolCallChainShared,
	resolveLargeRequestOffload,
	resolveStreamMetaPartialReason,
	sanitizeUpstreamRequestHeaders,
	shouldMarkStreamMetaPartial,
	shouldParseFailureStreamUsage,
	shouldParseSuccessStreamUsage,
	shouldTreatMissingUsageAsError,
	validateOpenAiToolCallChain as validateOpenAiToolCallChainShared,
} from "../../../shared-core/src";
import type { AppEnv } from "../../../worker/src/env";
import {
	type TokenRecord,
	tokenAuth,
} from "../../../worker/src/middleware/tokenAuth";
import type { CallTokenItem } from "../../../worker/src/services/call-token-selector";
import {
	resolveChannelAttemptTarget,
	type CallTokenSelection,
} from "../../../worker/src/services/channel-attemptability";
import { listCallTokens } from "../../../worker/src/services/channel-call-token-repo";
import {
	listCoolingDownChannelsForModel,
	listVerifiedModelsByChannel,
	recordChannelDisableHit,
} from "../../../worker/src/services/channel-model-capabilities";
import { listActiveChannels } from "../../../worker/src/services/channel-repo";
import { type ChannelRecord } from "../../../worker/src/services/channels";
import { selectCandidateChannels } from "../../../worker/src/services/channel-routing";
import { adaptChatResponse } from "../../../worker/src/services/chat-response-adapter";
import {
	buildActiveChannelsKey,
	buildCallTokensIndexKey,
	buildResponsesAffinityKey,
	buildStreamOptionsCapabilityKey,
	invalidateSelectionHotCache,
	readHotJson,
	writeHotJson,
} from "../../../worker/src/services/hot-kv";
import { shouldCooldown } from "../../../worker/src/services/model-cooldown";
import {
	buildProxyErrorCodeSet,
	resolveProxyErrorDecision,
	type ProxyErrorAction,
} from "../../../worker/src/services/proxy-error-policy";
import { listOpenAiModelsForChannels } from "../../../worker/src/services/openai-model-list";
import {
	extractErrorDetails,
	extractJsonErrorPayload,
} from "../../../worker/src/services/proxy-error-parser";
import {
	buildFetchExceptionFailure,
	buildSelectedAttemptState,
	buildUsageMissingFailure,
	buildZeroCompletionFailure,
	evaluateUpstreamHttpFailure,
	type SelectedAttemptState,
} from "../../../worker/src/services/proxy/attempt-evaluator";
import { prepareAttemptRequest } from "../../../worker/src/services/proxy/attempt-request-builder";
import {
	type AttemptBindingPolicy,
	type AttemptBindingState,
	type AttemptDispatchRequest,
	type DispatchRetryConfig,
	ATTEMPT_RESPONSE_ID_HEADER,
	ATTEMPT_STREAM_EVENTS_SEEN_HEADER,
	ATTEMPT_STREAM_FIRST_TOKEN_LATENCY_HEADER,
	ATTEMPT_STREAM_META_PARTIAL_HEADER,
	ATTEMPT_STREAM_META_REASON_HEADER,
	ATTEMPT_STREAM_USAGE_PROCESSED_HEADER,
	executeAttemptViaWorker,
	executeDispatchViaWorker,
	normalizeAttemptWorkerBaseUrl,
	parseBooleanHeader,
	parseOptionalCountHeader,
	parseOptionalLatencyHeader,
	readAttemptStreamAbnormal,
} from "../../../worker/src/services/proxy/attempt-transport";
import {
	extractModelFromRawJsonRequest,
	extractResponsesRequestHintsFromRawJsonRequest,
	type ResponsesRequestHints,
	rewriteModelInRawJsonRequest,
} from "../../../worker/src/services/proxy/request-body";
import {
	buildNoRoutableChannelsMeta,
	buildUpstreamHeaders,
	filterAllowedChannels,
	isOpenAiModelsListRequest,
	mergeQuery,
	normalizeIncomingRequestPath,
	resolveAttemptableChannels,
	resolveChannelBaseUrl,
} from "../../../worker/src/services/proxy/request-planning";
import {
	extractOpenAiResponseIdFromJson,
	isStreamOptionsUnsupportedMessage,
} from "../../../worker/src/services/proxy/response-helpers";
import {
	buildAttemptFailureResponse,
	finalizeSelectedResponse,
} from "../../../worker/src/services/proxy/response-finalizer";
import {
	getSuccessfulUsageWarning,
	shouldValidateToolSchemasFromRequestText,
} from "../../../worker/src/services/proxy-request-guards";
import {
	ABNORMAL_SUCCESS_RESPONSE_ERROR_CODE,
	type AbnormalSuccessDetails,
	classifyStreamUsageParseError,
	createUsageEventScheduler,
	detectAbnormalStreamSuccessResponse,
	detectAbnormalSuccessResponse,
	hasUsageHeaders,
	hasUsageJsonHint,
	transformOpenAiStreamOptions,
} from "../../../worker/src/services/proxy/usage-observe";
import { validateToolSchemasInBody } from "../../../worker/src/services/proxy/request-validation";
import {
	type AttemptFailureDetail,
	buildAttemptFailureSummary,
	buildAttemptSequence,
	buildUpstreamDiagnosticMeta,
	type ErrorDetails,
	type ExecutionContextLike,
	formatUsageErrorMessage,
	getStreamUsageMaxParsers,
	getStreamUsageOptions,
	getStreamUsageParseTimeoutMs,
	mergeErrorMetaJson,
	normalizeMessage,
	normalizeStringField,
	normalizeSummaryDetail,
	normalizeUpstreamErrorCode,
	scheduleDbWrite,
	shouldTreatZeroCompletionAsError,
	sleep,
	stringifyErrorMeta,
} from "../../../worker/src/services/proxy/shared";
import {
	applyGeminiModelToPath,
	detectDownstreamProvider,
	detectEndpointType,
	type EndpointType,
	type NormalizedChatRequest,
	type NormalizedEmbeddingRequest,
	type NormalizedImageRequest,
	normalizeChatRequest,
	normalizeEmbeddingRequest,
	normalizeImageRequest,
	type ProviderType,
	parseDownstreamModel,
	parseDownstreamStream,
} from "../../../worker/src/services/provider-transform";
import { getProxyRuntimeSettings } from "../../../worker/src/services/settings";
import {
	processUsageEvent,
	type UsageEvent,
} from "../../../worker/src/services/usage-events";
import { jsonError } from "../../../worker/src/utils/http";
import { safeJsonParse } from "../../../worker/src/utils/json";
import { extractReasoningEffort } from "../../../worker/src/utils/reasoning";
import {
	type NormalizedUsage,
	parseUsageFromHeaders,
	parseUsageFromJson,
	parseUsageFromSse,
	type StreamAbnormalSuccess,
	type StreamUsage,
	type StreamUsageMode,
	type StreamUsageOptions,
	StreamUsageParseError,
} from "../../../worker/src/utils/usage";

const proxy = new Hono<AppEnv>();

type ResponsesAffinityRecord = {
	channelId: string;
	tokenId: string | null;
	model: string | null;
	updatedAt: string;
};

type StreamOptionsCapabilityRecord = {
	supported: boolean;
	updatedAt: string;
};

const PROXY_UPSTREAM_TIMEOUT_ERROR_CODE = "proxy_upstream_timeout";
const PROXY_UPSTREAM_FETCH_ERROR_CODE = "proxy_upstream_fetch_exception";
const DOWNSTREAM_CLIENT_ABORT_ERROR_CODE = "client_disconnected";
const USAGE_ZERO_COMPLETION_TOKENS_ERROR_CODE = "usage_zero_completion_tokens";
const INTERNAL_USAGE_ERROR_MESSAGE_MAX_LENGTH = 320;
const UPSTREAM_ERROR_DETAIL_MAX_LENGTH = 240;
const HOT_KV_ACTIVE_CHANNELS_TTL_SECONDS = 60;
const HOT_KV_CALL_TOKENS_TTL_SECONDS = 60;
const RESPONSES_TOOL_CALL_NOT_FOUND_SNIPPET =
	"no tool call found for function call output";
const HA_TRACE_ID_HEADER = "x-ha-trace-id";
const HA_ATTEMPT_COUNT_HEADER = "x-ha-attempt-count";
const HA_CANDIDATE_COUNT_HEADER = "x-ha-candidate-count";
const HA_PROXY_QUALITY_HEADER = "x-ha-proxy-quality";
const HA_BIZ_STATUS_HEADER = "x-ha-biz-status";
const HA_QUALITY_REASON_HEADER = "x-ha-quality-reason";
const MAX_ATTEMPT_WORKER_INVOCATIONS = 31;
const USAGE_OBSERVE_FAILURE_STAGE = "usage_observe";
const PROXY_INTERNAL_ERROR_CODE = "proxy_internal_error";
const PROVIDER_DETECT_FAILED_CODE = "provider_detect_failed";
const WEIGHTED_ORDER_FAILED_CODE = "weighted_order_failed";
const RESPONSE_ADAPT_FAILED_CODE = "response_adapt_failed";
const STREAM_META_PARTIAL_CODE = "stream_meta_partial";
const STREAM_META_PARTIAL_BIZ_STATUS = "29011";
const NO_ROUTABLE_CHANNELS_ERROR_CODE = "no_routable_channels";

let activeStreamUsageParsers = 0;

proxy.onError((error, c) => {
	const traceId = crypto.randomUUID();
	const errorMessage =
		error instanceof Error && error.message
			? error.message
			: "proxy_unhandled_exception";
	console.error("proxy_unhandled_exception", {
		traceId,
		path: c.req.path,
		message: errorMessage,
	});
	const response = c.json(
		{
			error: PROXY_INTERNAL_ERROR_CODE,
			code: PROXY_INTERNAL_ERROR_CODE,
		},
		502,
	);
	response.headers.set(HA_TRACE_ID_HEADER, traceId);
	response.headers.set(HA_ATTEMPT_COUNT_HEADER, "0");
	response.headers.set(HA_CANDIDATE_COUNT_HEADER, "0");
	return response;
});

/**
 * Multi-provider proxy handler.
 */
proxy.all("/*", tokenAuth, async (c) => {
	const db = c.env.DB;
	const tokenRecord = c.get("tokenRecord") as TokenRecord;
	const requestStart = Date.now();
	const traceId = crypto.randomUUID();
	let responseAttemptCount = 0;
	let responseCandidateCount = 0;
	let responseQuality: "ok" | "stream_meta_partial" = "ok";
	let responseBizStatus: string | null = null;
	let responseQualityReason: string | null = null;
	const markStreamMetaPartial = (options: {
		reason: string;
		path: string;
		eventsSeen: number;
		hasImmediateUsage: boolean;
		hasUsageHeaders: boolean;
	}) => {
		responseQuality = "stream_meta_partial";
		responseBizStatus = STREAM_META_PARTIAL_BIZ_STATUS;
		responseQualityReason = options.reason;
		console.warn("proxy_stream_meta_partial", {
			traceId,
			path: options.path,
			reason: options.reason,
			eventsSeen: options.eventsSeen,
			hasImmediateUsage: options.hasImmediateUsage,
			hasUsageHeaders: options.hasUsageHeaders,
		});
	};
	const withTraceHeader = (response: Response): Response => {
		const headers = new Headers(response.headers);
		headers.set(HA_TRACE_ID_HEADER, traceId);
		headers.set(HA_ATTEMPT_COUNT_HEADER, String(responseAttemptCount));
		headers.set(HA_CANDIDATE_COUNT_HEADER, String(responseCandidateCount));
		if (responseQuality !== "ok") {
			headers.set(HA_PROXY_QUALITY_HEADER, responseQuality);
			if (responseBizStatus) {
				headers.set(HA_BIZ_STATUS_HEADER, responseBizStatus);
			}
			if (responseQualityReason) {
				headers.set(HA_QUALITY_REASON_HEADER, responseQualityReason);
			}
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
	const jsonErrorWithTrace = (
		status: Parameters<typeof jsonError>[1],
		message: string,
		code?: string,
	): Response => withTraceHeader(jsonError(c, status, message, code));
	const downstreamSignal = c.req.raw.signal;
	const downstreamAbortResponse = (): Response =>
		withTraceHeader(
			new Response(
				JSON.stringify({
					error: DOWNSTREAM_CLIENT_ABORT_ERROR_CODE,
					code: DOWNSTREAM_CLIENT_ABORT_ERROR_CODE,
				}),
				{
					status: 499,
					headers: {
						"content-type": "application/json",
					},
				},
			),
		);
	const requestPath = normalizeIncomingRequestPath(c.req.path).path;
	if (isOpenAiModelsListRequest(c.req.method, c.req.path)) {
		const activeChannels = await listActiveChannels(db);
		const allowedChannels = filterAllowedChannels(activeChannels, tokenRecord);
		const payload = await listOpenAiModelsForChannels(db, allowedChannels);
		return withTraceHeader(c.json(payload));
	}
	const runtimeSettings = await getProxyRuntimeSettings(db);
	const retrySleepMs = Math.max(
		0,
		Math.floor(Number(runtimeSettings.retry_sleep_ms ?? 0)),
	);
	const retrySleepErrorCodeSet = buildProxyErrorCodeSet(
		runtimeSettings.retry_sleep_error_codes ?? [],
	);
	const retryReturnErrorCodeSet = buildProxyErrorCodeSet(
		runtimeSettings.retry_return_error_codes ?? [],
	);
	const channelDisableErrorCodeSet = buildProxyErrorCodeSet(
		runtimeSettings.channel_disable_error_codes ?? [],
	);
	const dispatchRetryConfig: DispatchRetryConfig = {
		sleepMs: retrySleepMs,
		disableErrorCodes: Array.from(channelDisableErrorCodeSet),
		returnErrorCodes: Array.from(retryReturnErrorCodeSet),
		sleepErrorCodes: Array.from(retrySleepErrorCodeSet),
	};
	const attemptBindingPolicy: AttemptBindingPolicy = {
		fallbackEnabled: runtimeSettings.attempt_worker_fallback_enabled,
		fallbackThreshold: Math.max(
			1,
			Math.floor(runtimeSettings.attempt_worker_fallback_threshold),
		),
	};
	const attemptBindingState: AttemptBindingState = {
		forceLocalDirect: false,
		bindingFailureCount: 0,
	};
	const attemptWorkerAvailable = Boolean(
		normalizeAttemptWorkerBaseUrl(c.env.LOCAL_ATTEMPT_WORKER_URL) ??
			c.env.ATTEMPT_WORKER,
	);
	let downstreamProvider: ProviderType;
	let endpointType: EndpointType;
	try {
		downstreamProvider = detectDownstreamProvider(requestPath);
		endpointType = detectEndpointType(downstreamProvider, requestPath);
	} catch (error) {
		console.error("proxy_provider_detect_failed", {
			traceId,
			path: requestPath,
			message:
				error instanceof Error ? error.message : "provider_detection_failed",
		});
		return jsonErrorWithTrace(
			502,
			PROVIDER_DETECT_FAILED_CODE,
			PROVIDER_DETECT_FAILED_CODE,
		);
	}
	const offloadThresholdBytes = Math.max(
		0,
		Math.floor(
			Number(runtimeSettings.large_request_offload_threshold_bytes ?? 32768),
		),
	);
	const requestText = await c.req.text();
	const offloadDecision = resolveLargeRequestOffload({
		attemptWorkerAvailable,
		thresholdBytes: offloadThresholdBytes,
		contentLengthHeader: c.req.header("content-length") ?? null,
	});
	const requestSizeBytes = offloadDecision.requestSizeKnown
		? (offloadDecision.requestSizeBytes ?? 0)
		: requestText.length;
	const shouldTryLargeRequestDispatch = offloadDecision.requestSizeKnown
		? offloadDecision.shouldOffload
		: attemptWorkerAvailable &&
			(offloadThresholdBytes === 0 ||
				requestSizeBytes >= offloadThresholdBytes);
	const shouldSkipHeavyBodyParsing = shouldTryLargeRequestDispatch;
	let parsedBodyInitialized = !shouldSkipHeavyBodyParsing;
	let parsedBody =
		parsedBodyInitialized && requestText
			? safeJsonParse<Record<string, unknown> | null>(requestText, null)
			: null;
	if (parsedBodyInitialized && downstreamProvider === "openai") {
		repairOpenAiToolCallChainShared(parsedBody, endpointType);
	}
	let responsesRequestHints =
		parsedBodyInitialized && downstreamProvider === "openai"
			? extractResponsesRequestHintsShared(parsedBody)
			: null;
	if (
		!responsesRequestHints &&
		shouldSkipHeavyBodyParsing &&
		downstreamProvider === "openai" &&
		endpointType === "responses"
	) {
		responsesRequestHints =
			extractResponsesRequestHintsFromRawJsonRequest(requestText);
	}
	let hasChatToolOutput =
		parsedBodyInitialized && downstreamProvider === "openai"
			? hasChatToolOutputHintShared(parsedBody)
			: false;
	let reasoningEffort = extractReasoningEffort(parsedBody);
	let effectiveRequestText = parsedBody
		? JSON.stringify(parsedBody)
		: requestText;
	const ensureParsedBody = (): Record<string, unknown> | null => {
		if (parsedBodyInitialized) {
			return parsedBody;
		}
		parsedBodyInitialized = true;
		parsedBody = requestText
			? safeJsonParse<Record<string, unknown> | null>(requestText, null)
			: null;
		if (downstreamProvider === "openai") {
			repairOpenAiToolCallChainShared(parsedBody, endpointType);
			responsesRequestHints = extractResponsesRequestHintsShared(parsedBody);
			hasChatToolOutput = hasChatToolOutputHintShared(parsedBody);
		}
		reasoningEffort = extractReasoningEffort(parsedBody);
		effectiveRequestText = parsedBody
			? JSON.stringify(parsedBody)
			: requestText;
		return parsedBody;
	};
	const rawRequestModel = extractModelFromRawJsonRequest(requestText);
	const modelProbeBody =
		parsedBody ??
		(rawRequestModel
			? ({ model: rawRequestModel } as Record<string, unknown>)
			: null);
	const parsedDownstreamModel = parseDownstreamModel(
		downstreamProvider,
		requestPath,
		modelProbeBody,
	);
	const downstreamModel = parsedDownstreamModel ?? rawRequestModel;
	const inferredStream =
		shouldSkipHeavyBodyParsing && requestText
			? detectStreamFlagFromRawJsonRequest(requestText)
			: null;
	const isStream =
		inferredStream ??
		parseDownstreamStream(downstreamProvider, requestPath, parsedBody);
	const scheduleUsageEvent = createUsageEventScheduler(c);
	let normalizedChat: NormalizedChatRequest | null = null;
	let normalizedEmbedding: NormalizedEmbeddingRequest | null = null;
	let normalizedImage: NormalizedImageRequest | null = null;
	const ensureNormalizedChat = (): NormalizedChatRequest | null => {
		if (endpointType !== "chat" && endpointType !== "responses") {
			return null;
		}
		if (normalizedChat) {
			return normalizedChat;
		}
		const ensuredBody = ensureParsedBody();
		if (!ensuredBody) {
			return null;
		}
		normalizedChat = normalizeChatRequest(
			downstreamProvider,
			endpointType,
			ensuredBody,
			downstreamModel,
			isStream,
		);
		return normalizedChat;
	};
	const ensureNormalizedEmbedding = (): NormalizedEmbeddingRequest | null => {
		if (endpointType !== "embeddings") {
			return null;
		}
		if (normalizedEmbedding) {
			return normalizedEmbedding;
		}
		const ensuredBody = ensureParsedBody();
		if (!ensuredBody) {
			return null;
		}
		normalizedEmbedding = normalizeEmbeddingRequest(
			downstreamProvider,
			ensuredBody,
			downstreamModel,
		);
		return normalizedEmbedding;
	};
	const ensureNormalizedImage = (): NormalizedImageRequest | null => {
		if (endpointType !== "images") {
			return null;
		}
		if (normalizedImage) {
			return normalizedImage;
		}
		const ensuredBody = ensureParsedBody();
		if (!ensuredBody) {
			return null;
		}
		normalizedImage = normalizeImageRequest(
			downstreamProvider,
			ensuredBody,
			downstreamModel,
		);
		return normalizedImage;
	};

	const recordEarlyUsage = (options: {
		status: number;
		code: string;
		message?: string | null;
		failureStage?: string | null;
		failureReason?: string | null;
		usageSource?: string | null;
		errorMetaJson?: string | null;
	}) => {
		const latencyMs = Date.now() - requestStart;
		const errorMessage = options.message ?? options.code;
		scheduleUsageEvent({
			type: "usage",
			payload: {
				tokenId: tokenRecord.id,
				channelId: null,
				model: downstreamModel,
				requestPath,
				totalTokens: 0,
				latencyMs,
				firstTokenLatencyMs: isStream ? null : latencyMs,
				stream: isStream,
				reasoningEffort,
				status: "error",
				upstreamStatus: options.status,
				errorCode: options.code,
				errorMessage,
				failureStage: options.failureStage ?? "request",
				failureReason: options.failureReason ?? options.code,
				usageSource: options.usageSource ?? "none",
				errorMetaJson: options.errorMetaJson ?? null,
			},
		});
	};
	const recordAttemptUsage = (options: {
		channelId: string | null;
		requestPath: string;
		latencyMs: number;
		firstTokenLatencyMs: number | null;
		usage: NormalizedUsage | null;
		status: "ok" | "warn" | "error";
		upstreamStatus: number | null;
		errorCode?: string | null;
		errorMessage?: string | null;
		failureStage?: string | null;
		failureReason?: string | null;
		usageSource?: string | null;
		errorMetaJson?: string | null;
		tokenId?: string | null;
		tokenName?: string | null;
	}) => {
		const normalized = options.usage ?? {
			totalTokens: 0,
			promptTokens: 0,
			completionTokens: 0,
		};
		scheduleUsageEvent({
			type: "usage",
			payload: {
				tokenId: tokenRecord.id,
				channelId: options.channelId,
				model: downstreamModel,
				requestPath: options.requestPath,
				totalTokens: normalized.totalTokens,
				promptTokens: normalized.promptTokens,
				completionTokens: normalized.completionTokens,
				cost: 0,
				latencyMs: options.latencyMs,
				firstTokenLatencyMs: options.firstTokenLatencyMs,
				stream: isStream,
				reasoningEffort,
				status: options.status,
				upstreamStatus: options.upstreamStatus,
				errorCode: options.errorCode ?? null,
				errorMessage: options.errorMessage ?? null,
				failureStage: options.failureStage ?? null,
				failureReason: options.failureReason ?? options.errorCode ?? null,
				usageSource:
					options.usageSource ?? (options.usage ? "computed" : "none"),
				errorMetaJson: options.errorMetaJson ?? null,
				callTokenId: options.tokenId ?? selectedAttemptTokenId,
				callTokenName: options.tokenName ?? selectedAttemptTokenName,
			},
		});
	};
	const recordAttemptLog = (options: {
		attemptIndex: number;
		channelId: string | null;
		provider: ProviderType | null;
		model: string | null;
		status: "ok" | "warn" | "error";
		errorClass?: string | null;
		errorCode?: string | null;
		httpStatus?: number | null;
		latencyMs: number;
		upstreamRequestId?: string | null;
		startedAt: string;
		endedAt: string;
		rawSizeBytes?: number | null;
		rawHash?: string | null;
		tokenId?: string | null;
		tokenName?: string | null;
	}) => {
		if (!runtimeSettings.attempt_log_enabled) {
			return;
		}
		scheduleUsageEvent({
			type: "attempt_log",
			payload: {
				traceId,
				attemptIndex: options.attemptIndex,
				channelId: options.channelId,
				provider: options.provider,
				model: options.model,
				status: options.status,
				errorClass: options.errorClass ?? null,
				errorCode: options.errorCode ?? null,
				httpStatus: options.httpStatus ?? null,
				latencyMs: options.latencyMs,
				upstreamRequestId: options.upstreamRequestId ?? null,
				startedAt: options.startedAt,
				endedAt: options.endedAt,
				rawSizeBytes: options.rawSizeBytes ?? requestSizeBytes,
				rawHash: options.rawHash ?? null,
				callTokenId: options.tokenId ?? selectedAttemptTokenId,
				callTokenName: options.tokenName ?? selectedAttemptTokenName,
			},
		});
	};
	const toolSchemaValidationBody = parsedBodyInitialized
		? parsedBody
		: shouldValidateToolSchemasFromRequestText(downstreamProvider, requestText)
			? ensureParsedBody()
			: null;
	if (toolSchemaValidationBody) {
		const toolSchemaIssue = validateToolSchemasInBody(toolSchemaValidationBody);
		if (toolSchemaIssue) {
			recordEarlyUsage({
				status: 400,
				code: toolSchemaIssue.code,
				message: toolSchemaIssue.message,
				failureStage: "request_validation",
				failureReason: toolSchemaIssue.code,
				usageSource: "none",
				errorMetaJson: toolSchemaIssue.errorMetaJson,
			});
			return jsonErrorWithTrace(
				400,
				toolSchemaIssue.message,
				toolSchemaIssue.code,
			);
		}
		if (downstreamProvider === "openai") {
			const toolCallChainIssue = validateOpenAiToolCallChainShared(
				toolSchemaValidationBody,
				endpointType,
				responsesRequestHints,
			);
			if (toolCallChainIssue) {
				recordEarlyUsage({
					status: 409,
					code: toolCallChainIssue.code,
					message: toolCallChainIssue.message,
					failureStage: "request_validation",
					failureReason: toolCallChainIssue.code,
					usageSource: "none",
					errorMetaJson: toolCallChainIssue.errorMetaJson,
				});
				return jsonErrorWithTrace(
					409,
					toolCallChainIssue.code,
					toolCallChainIssue.code,
				);
			}
		}
	}

	const activeChannelsCacheKey = buildActiveChannelsKey();
	let activeChannelRows = await readHotJson<ChannelRecord[]>(
		c.env.KV_HOT,
		activeChannelsCacheKey,
	);
	if (!Array.isArray(activeChannelRows)) {
		const selectionNowSeconds = Math.floor(Date.now() / 1000);
		const activeChannels = await db
			.prepare(
				"SELECT * FROM channels WHERE status = ? AND COALESCE(auto_disabled_permanent, 0) = 0 AND (auto_disabled_until IS NULL OR auto_disabled_until <= ?)",
			)
			.bind("active", selectionNowSeconds)
			.all<ChannelRecord>();
		activeChannelRows = (activeChannels.results ?? []) as ChannelRecord[];
		scheduleDbWrite(
			c,
			writeHotJson(
				c.env.KV_HOT,
				activeChannelsCacheKey,
				activeChannelRows,
				HOT_KV_ACTIVE_CHANNELS_TTL_SECONDS,
			),
		);
	}
	const channelIds = activeChannelRows.map((channel) => channel.id);
	const callTokensCacheKey = buildCallTokensIndexKey();
	const cachedCallTokenRows = await readHotJson<
		Array<{
			id: string;
			channel_id: string;
			name: string;
			api_key: string;
			models_json?: string | null;
		}>
	>(c.env.KV_HOT, callTokensCacheKey);
	let callTokenRows: Array<{
		id: string;
		channel_id: string;
		name: string;
		api_key: string;
		models_json?: string | null;
	}> = [];
	if (Array.isArray(cachedCallTokenRows)) {
		callTokenRows = cachedCallTokenRows;
	} else {
		callTokenRows = await listCallTokens(db, {
			channelIds,
		});
		scheduleDbWrite(
			c,
			writeHotJson(
				c.env.KV_HOT,
				callTokensCacheKey,
				callTokenRows,
				HOT_KV_CALL_TOKENS_TTL_SECONDS,
			),
		);
	}
	const callTokenMap = new Map<string, CallTokenItem[]>();
	for (const row of callTokenRows) {
		const entry: CallTokenItem = {
			id: row.id,
			channel_id: row.channel_id,
			name: row.name,
			api_key: row.api_key,
			models_json: row.models_json ?? null,
		};
		const list = callTokenMap.get(row.channel_id) ?? [];
		list.push(entry);
		callTokenMap.set(row.channel_id, list);
	}
	const allowedChannels = filterAllowedChannels(activeChannelRows, tokenRecord);
	const verifiedModelsByChannel = downstreamModel
		? await listVerifiedModelsByChannel(
				db,
				allowedChannels.map((channel) => channel.id),
			)
		: new Map<string, Set<string>>();
	const modelCompatibleCandidates = selectCandidateChannels(
		allowedChannels,
		downstreamModel,
		verifiedModelsByChannel,
	);
	const routableCandidates = resolveAttemptableChannels({
		channels: modelCompatibleCandidates,
		callTokenMap,
		downstreamModel,
		downstreamProvider,
		endpointType,
		verifiedModelsByChannel,
	});
	let candidates = routableCandidates.channels;
	const canResolveResponsesAffinity = Boolean(c.env.KV_HOT);
	const hasUnresolvedToolOutput =
		endpointType === "responses"
			? hasUnresolvedResponsesFunctionCallOutputShared(
					parsedBody,
					responsesRequestHints,
				)
			: false;
	const responsesPreviousResponseId =
		responsesRequestHints?.previousResponseId ?? null;
	let responsesPinnedChannelId: string | null = null;
	if (
		canResolveResponsesAffinity &&
		hasUnresolvedToolOutput &&
		!responsesPreviousResponseId
	) {
		const code = "responses_previous_response_id_required";
		recordEarlyUsage({
			status: 409,
			code,
			message:
				"responses_previous_response_id_required: function_call_output requires previous_response_id for routed channels",
		});
		return jsonErrorWithTrace(409, code, code);
	}
	if (canResolveResponsesAffinity && responsesPreviousResponseId) {
		const affinityKey = buildResponsesAffinityKey(responsesPreviousResponseId);
		const affinity = await readHotJson<ResponsesAffinityRecord>(
			c.env.KV_HOT,
			affinityKey,
		);
		const candidateChannelId = normalizeStringField(affinity?.channelId);
		const affinityTokenId = normalizeStringField(affinity?.tokenId);
		if (
			candidateChannelId &&
			(!affinityTokenId || affinityTokenId === tokenRecord.id)
		) {
			responsesPinnedChannelId = candidateChannelId;
		}
	}
	const affinityFallbackEnabled = true;
	if (
		canResolveResponsesAffinity &&
		hasUnresolvedToolOutput &&
		responsesPreviousResponseId &&
		!responsesPinnedChannelId &&
		!affinityFallbackEnabled
	) {
		const code = "responses_affinity_missing";
		recordEarlyUsage({
			status: 409,
			code,
			message: `responses_affinity_missing: previous_response_id=${responsesPreviousResponseId}`,
		});
		return jsonErrorWithTrace(409, code, code);
	}
	const candidatesBeforeAffinity = candidates;
	if (responsesPinnedChannelId) {
		const isActivePinnedChannel = activeChannelRows.some(
			(channel) => channel.id === responsesPinnedChannelId,
		);
		if (!isActivePinnedChannel) {
			if (!affinityFallbackEnabled) {
				const code = "responses_affinity_channel_disabled";
				recordEarlyUsage({
					status: 409,
					code,
					message: `responses_affinity_channel_disabled: previous_response_id=${responsesRequestHints?.previousResponseId ?? "-"}, channel_id=${responsesPinnedChannelId}`,
				});
				return jsonErrorWithTrace(409, code, code);
			}
			responsesPinnedChannelId = null;
		}
		const isAllowedPinnedChannel = responsesPinnedChannelId
			? allowedChannels.some(
					(channel) => channel.id === responsesPinnedChannelId,
				)
			: false;
		if (responsesPinnedChannelId && !isAllowedPinnedChannel) {
			if (!affinityFallbackEnabled) {
				const code = "responses_affinity_channel_not_allowed";
				recordEarlyUsage({
					status: 409,
					code,
					message: `responses_affinity_channel_not_allowed: previous_response_id=${responsesRequestHints?.previousResponseId ?? "-"}, channel_id=${responsesPinnedChannelId}`,
				});
				return jsonErrorWithTrace(409, code, code);
			}
			responsesPinnedChannelId = null;
		}
		if (responsesPinnedChannelId) {
			candidates = candidates.filter(
				(channel) => channel.id === responsesPinnedChannelId,
			);
		}
		if (responsesPinnedChannelId && candidates.length === 0) {
			if (!affinityFallbackEnabled) {
				const code = "responses_affinity_channel_model_unavailable";
				recordEarlyUsage({
					status: 409,
					code,
					message: `responses_affinity_channel_model_unavailable: previous_response_id=${responsesRequestHints?.previousResponseId ?? "-"}, channel_id=${responsesPinnedChannelId}, model=${downstreamModel ?? "-"}`,
				});
				return jsonErrorWithTrace(409, code, code);
			}
			responsesPinnedChannelId = null;
			candidates = candidatesBeforeAffinity;
		}
		if (responsesPinnedChannelId && downstreamModel) {
			const pinnedCooldownMinutes = Math.max(
				0,
				Math.floor(runtimeSettings.model_failure_cooldown_minutes),
			);
			const pinnedCooldownSeconds = pinnedCooldownMinutes * 60;
			const pinnedCooldownThreshold = Math.max(
				1,
				Math.floor(runtimeSettings.model_failure_cooldown_threshold),
			);
			if (pinnedCooldownSeconds > 0) {
				const coolingChannels = await listCoolingDownChannelsForModel(
					db,
					[responsesPinnedChannelId],
					downstreamModel,
					pinnedCooldownSeconds,
					pinnedCooldownThreshold,
				);
				if (coolingChannels.has(responsesPinnedChannelId)) {
					if (!affinityFallbackEnabled) {
						const code = "responses_affinity_channel_cooldown";
						recordEarlyUsage({
							status: 409,
							code,
							message: `responses_affinity_channel_cooldown: previous_response_id=${responsesRequestHints?.previousResponseId ?? "-"}, channel_id=${responsesPinnedChannelId}, model=${downstreamModel}`,
						});
						return jsonErrorWithTrace(409, code, code);
					}
					responsesPinnedChannelId = null;
					candidates = candidatesBeforeAffinity;
				}
			}
		}
	}
	const cooldownMinutes = Math.max(
		0,
		Math.floor(runtimeSettings.model_failure_cooldown_minutes),
	);
	const cooldownSeconds = cooldownMinutes * 60;
	const cooldownFailureThreshold = Math.max(
		1,
		Math.floor(runtimeSettings.model_failure_cooldown_threshold),
	);
	const channelDisableThreshold = Math.max(
		1,
		Math.floor(runtimeSettings.channel_disable_error_threshold),
	);
	const channelDisableDurationSeconds =
		Math.max(
			0,
			Math.floor(runtimeSettings.channel_disable_error_code_minutes),
		) * 60;
	const responsesAffinityTtlSeconds = Math.max(
		60,
		Math.floor(runtimeSettings.responses_affinity_ttl_seconds),
	);
	const streamOptionsCapabilityTtlSeconds = Math.max(
		60,
		Math.floor(runtimeSettings.stream_options_capability_ttl_seconds),
	);
	const streamUsageOptions = getStreamUsageOptions(runtimeSettings);
	const streamUsageMode = streamUsageOptions.mode ?? "lite";
	const streamUsageMaxParsers = getStreamUsageMaxParsers(runtimeSettings);
	const usageErrorMessageMaxLength = INTERNAL_USAGE_ERROR_MESSAGE_MAX_LENGTH;
	const streamUsageParseTimeoutMs =
		getStreamUsageParseTimeoutMs(runtimeSettings);
	if (
		!responsesPinnedChannelId &&
		downstreamModel &&
		cooldownSeconds > 0 &&
		candidates.length > 0
	) {
		const coolingChannels = await listCoolingDownChannelsForModel(
			db,
			candidates.map((channel) => channel.id),
			downstreamModel,
			cooldownSeconds,
			cooldownFailureThreshold,
		);
		if (coolingChannels.size > 0) {
			candidates = candidates.filter(
				(channel) => !coolingChannels.has(channel.id),
			);
			if (candidates.length === 0) {
				void cooldownMinutes;
				void cooldownFailureThreshold;
				void coolingChannels;
				recordEarlyUsage({
					status: 503,
					code: "upstream_cooldown",
					message: "upstream_cooldown",
				});
				return jsonErrorWithTrace(
					503,
					"upstream_cooldown",
					"upstream_cooldown",
				);
			}
		}
	}

	if (
		modelCompatibleCandidates.length > 0 &&
		candidates.length === 0 &&
		routableCandidates.skipped.length > 0
	) {
		recordEarlyUsage({
			status: 503,
			code: NO_ROUTABLE_CHANNELS_ERROR_CODE,
			message: NO_ROUTABLE_CHANNELS_ERROR_CODE,
			failureStage: "channel_select",
			failureReason: NO_ROUTABLE_CHANNELS_ERROR_CODE,
			usageSource: "none",
			errorMetaJson: buildNoRoutableChannelsMeta(routableCandidates.skipped),
		});
		return jsonErrorWithTrace(
			503,
			NO_ROUTABLE_CHANNELS_ERROR_CODE,
			NO_ROUTABLE_CHANNELS_ERROR_CODE,
		);
	}

	if (candidates.length === 0) {
		recordEarlyUsage({
			status: 503,
			code: "no_available_channels",
			message: "no_available_channels",
		});
		return jsonErrorWithTrace(
			503,
			"no_available_channels",
			"no_available_channels",
		);
	}
	const targetPath = requestPath;
	const querySuffix = c.req.url.includes("?")
		? `?${c.req.url.split("?")[1]}`
		: "";

	const maxRetries = Math.max(
		0,
		Math.floor(Number(runtimeSettings.retry_max_retries ?? 3)),
	);
	const maxAttempts = Math.min(maxRetries + 1, MAX_ATTEMPT_WORKER_INVOCATIONS);
	let ordered: ChannelRecord[];
	try {
		ordered = buildAttemptSequence(candidates, maxAttempts);
	} catch (error) {
		console.error("proxy_weighted_order_failed", {
			traceId,
			path: requestPath,
			message: error instanceof Error ? error.message : "weighted_order_failed",
		});
		recordEarlyUsage({
			status: 502,
			code: WEIGHTED_ORDER_FAILED_CODE,
			message: WEIGHTED_ORDER_FAILED_CODE,
			failureStage: "channel_select",
			failureReason: WEIGHTED_ORDER_FAILED_CODE,
		});
		return jsonErrorWithTrace(
			502,
			WEIGHTED_ORDER_FAILED_CODE,
			WEIGHTED_ORDER_FAILED_CODE,
		);
	}
	responseCandidateCount = candidates.length;
	const upstreamTimeoutMs = Math.max(
		0,
		Math.floor(Number(runtimeSettings.upstream_timeout_ms ?? 30000)),
	);
	const zeroCompletionAsErrorEnabled =
		runtimeSettings.zero_completion_as_error_enabled !== false;
	const nowSeconds = Math.floor(Date.now() / 1000);
	let selectedResponse: Response | null = null;
	let selectedChannel: ChannelRecord | null = null;
	let selectedAttemptTokenId: string | null = null;
	let selectedAttemptTokenName: string | null = null;
	let selectedUpstreamProvider: ProviderType | null = null;
	let selectedUpstreamEndpoint: EndpointType | null = null;
	let selectedUpstreamModel: string | null = null;
	let selectedRequestPath = targetPath;
	let selectedImmediateUsage: NormalizedUsage | null = null;
	let selectedImmediateUsageSource: "json" | "header" | "none" = "none";
	let selectedHasUsageSignal = false;
	let selectedParsedStreamUsage: StreamUsage | null = null;
	let selectedHasUsageHeaders = false;
	let selectedAttemptIndex: number | null = null;
	let selectedAttemptStartedAt: string | null = null;
	let selectedAttemptLatencyMs: number | null = null;
	let selectedAttemptUpstreamRequestId: string | null = null;
	let selectedClientDisconnectRecorded = false;
	let selectedStreamUsageRecorded = false;
	let lastErrorDetails: ErrorDetails | null = null;
	let attemptsExecuted = 0;
	const blockedChannelIds = new Set<string>();
	const recordSelectedStreamUsage = (options: {
		usage: NormalizedUsage | null;
		usageSource: string;
		firstTokenLatencyMs: number | null;
		status: "ok" | "warn" | "error";
		errorCode?: string | null;
		errorMessage?: string | null;
		failureStage: string;
		failureReason?: string | null;
		errorMetaJson?: string | null;
	}) => {
		if (selectedStreamUsageRecorded || !selectedResponse || !selectedChannel) {
			return;
		}
		selectedStreamUsageRecorded = true;
		recordAttemptUsage({
			channelId: selectedChannel.id,
			requestPath: selectedRequestPath,
			latencyMs: Date.now() - requestStart,
			firstTokenLatencyMs: options.firstTokenLatencyMs,
			usage: options.usage,
			status: options.status,
			upstreamStatus: selectedResponse.status,
			errorCode: options.errorCode ?? null,
			errorMessage: options.errorMessage ?? null,
			failureStage: options.failureStage,
			failureReason: options.failureReason ?? options.errorCode ?? null,
			usageSource: options.usageSource,
			errorMetaJson: options.errorMetaJson ?? null,
		});
	};
	const recordSelectedClientDisconnect = (options?: {
		usage?: NormalizedUsage | null;
		usageSource?: string | null;
		firstTokenLatencyMs?: number | null;
		failureReason?: string | null;
	}) => {
		if (
			selectedClientDisconnectRecorded ||
			!selectedResponse ||
			!selectedChannel
		) {
			return;
		}
		selectedClientDisconnectRecorded = true;
		const latencyMs = Date.now() - requestStart;
		const failureReason =
			options?.failureReason ?? DOWNSTREAM_CLIENT_ABORT_ERROR_CODE;
		const usageSource = options?.usageSource ?? selectedImmediateUsageSource;
		const firstTokenLatencyMs =
			options?.firstTokenLatencyMs ??
			(isStream ? null : (selectedAttemptLatencyMs ?? latencyMs));
		const usage = options?.usage ?? selectedImmediateUsage;
		recordAttemptUsage({
			channelId: selectedChannel.id,
			requestPath: selectedRequestPath,
			latencyMs,
			firstTokenLatencyMs,
			usage,
			status: "warn",
			upstreamStatus: selectedResponse.status,
			errorCode: DOWNSTREAM_CLIENT_ABORT_ERROR_CODE,
			errorMessage:
				failureReason === DOWNSTREAM_CLIENT_ABORT_ERROR_CODE
					? DOWNSTREAM_CLIENT_ABORT_ERROR_CODE
					: `${DOWNSTREAM_CLIENT_ABORT_ERROR_CODE}: ${failureReason}`,
			failureStage: "downstream_response",
			failureReason,
			usageSource,
		});
		selectedStreamUsageRecorded = true;
		if (
			selectedAttemptIndex !== null &&
			selectedAttemptStartedAt &&
			selectedAttemptLatencyMs !== null
		) {
			recordAttemptLog({
				attemptIndex: selectedAttemptIndex,
				channelId: selectedChannel.id,
				provider: selectedUpstreamProvider,
				model: selectedUpstreamModel ?? downstreamModel,
				status: "warn",
				errorClass: "downstream_response",
				errorCode: DOWNSTREAM_CLIENT_ABORT_ERROR_CODE,
				httpStatus: selectedResponse.status,
				latencyMs: selectedAttemptLatencyMs,
				upstreamRequestId: selectedAttemptUpstreamRequestId,
				startedAt: selectedAttemptStartedAt,
				endedAt: new Date().toISOString(),
			});
		}
	};
	const parseStreamUsageOnFailure = async (response: Response) => {
		if (
			!isStream ||
			!shouldParseFailureStreamUsage(streamUsageMode as "full" | "lite" | "off")
		) {
			return {
				usage: null as NormalizedUsage | null,
				usageSource: "none" as const,
			};
		}
		try {
			const streamUsage = await parseUsageFromSse(response.clone(), {
				...streamUsageOptions,
				timeoutMs: streamUsageParseTimeoutMs,
			});
			return {
				usage: streamUsage.usage,
				usageSource: streamUsage.usage
					? ("stream" as const)
					: ("none" as const),
			};
		} catch {
			return {
				usage: null as NormalizedUsage | null,
				usageSource: "none" as const,
			};
		}
	};
	const attemptFailures: AttemptFailureDetail[] = [];
	const appendAttemptFailure = (options: {
		attemptIndex: number;
		channel: ChannelRecord | null;
		httpStatus: number | null;
		errorCode: string;
		errorMessage: string;
		latencyMs: number;
	}) => {
		attemptFailures.push({
			attemptIndex: options.attemptIndex,
			channelId: options.channel?.id ?? null,
			channelName: options.channel?.name ?? null,
			httpStatus: options.httpStatus,
			errorCode: options.errorCode,
			errorMessage: options.errorMessage,
			latencyMs: options.latencyMs,
		});
	};
	const resolveFailureAction = (
		errorCode: string | null,
		errorMessage: string | null,
	): ProxyErrorAction =>
		resolveProxyErrorDecision(
			{
				sleepErrorCodeSet: retrySleepErrorCodeSet,
				disableErrorCodeSet: channelDisableErrorCodeSet,
				returnErrorCodeSet: retryReturnErrorCodeSet,
			},
			errorCode,
			errorMessage,
		).action;
	const resolveFailureWithMeta = (options: {
		errorCode: string | null;
		errorMessage: string | null;
		errorMetaJson?: string | null;
		overrideAction?: ProxyErrorAction | null;
	}): { action: ProxyErrorAction; errorMetaJson: string | null } => {
		const decision = resolveProxyErrorDecision(
			{
				sleepErrorCodeSet: retrySleepErrorCodeSet,
				disableErrorCodeSet: channelDisableErrorCodeSet,
				returnErrorCodeSet: retryReturnErrorCodeSet,
			},
			options.errorCode,
			options.errorMessage,
		);
		const action = options.overrideAction ?? decision.action;
		return {
			action,
			errorMetaJson: mergeErrorMetaJson(options.errorMetaJson, {
				normalized_error_code: decision.normalizedErrorCode,
				policy_action: action,
				policy_resolved_action: decision.action,
				policy_lookup_keys: decision.lookupKeys,
				policy_matched_key: decision.matchedKey,
				policy_matched_set: decision.matchedSet,
				policy_action_source: options.overrideAction ? "override" : "policy",
			}),
		};
	};
	const applyDisableAction = async (options: {
		channelId: string;
		errorCode: string;
	}): Promise<void> => {
		blockedChannelIds.add(options.channelId);
		const normalizedErrorCode = options.errorCode.trim().toLowerCase();
		const disableResult = await recordChannelDisableHit(
			db,
			options.channelId,
			normalizedErrorCode,
			{
				disableDurationSeconds: channelDisableDurationSeconds,
				disableThreshold: channelDisableThreshold,
			},
			nowSeconds,
		);
		if (disableResult.channelTempDisabled || disableResult.channelDisabled) {
			await invalidateSelectionHotCache(c.env.KV_HOT);
		}
	};
	const scheduleModelCooldown = (options: {
		channelId: string;
		model: string | null;
		upstreamStatus: number | null;
		errorCode: string | null;
		errorMessage: string | null;
	}) => {
		const action = resolveFailureAction(
			options.errorCode,
			options.errorMessage,
		);
		if (action !== "retry") {
			return;
		}
		if (!shouldCooldown(options.upstreamStatus, options.errorCode)) {
			return;
		}
		if (!options.model || cooldownSeconds <= 0) {
			return;
		}
		scheduleUsageEvent({
			type: "model_error",
			payload: {
				channelId: options.channelId,
				model: options.model,
				errorCode:
					normalizeMessage(options.errorCode) ??
					(options.upstreamStatus === null
						? ABNORMAL_SUCCESS_RESPONSE_ERROR_CODE
						: String(options.upstreamStatus)),
				cooldownSeconds,
				cooldownFailureThreshold,
				nowSeconds,
			},
		});
	};
	const continueAfterFailure = async (
		attemptNumber: number,
		action: ProxyErrorAction,
	): Promise<boolean> => {
		if (downstreamSignal.aborted) {
			return false;
		}
		if (attemptNumber >= ordered.length) {
			return false;
		}
		if (action === "sleep" && retrySleepMs > 0) {
			const completedSleep = await sleep(retrySleepMs, downstreamSignal);
			if (!completedSleep) {
				return false;
			}
		}
		return !downstreamSignal.aborted;
	};
	const buildDirectErrorResponse = (
		status: number | null,
		errorCode: string,
	): Response => {
		responseAttemptCount = attemptsExecuted;
		const responseStatus = (
			status !== null && status >= 400 ? status : 502
		) as Parameters<typeof jsonError>[1];
		return jsonErrorWithTrace(responseStatus, errorCode, errorCode);
	};
	const responsesToolCallMismatchChannels: string[] = [];
	const streamOptionsCapabilityMemo = new Map<
		string,
		"supported" | "unsupported" | "unknown"
	>();
	const loadStreamOptionsCapability = async (
		channelId: string,
	): Promise<"supported" | "unsupported" | "unknown"> => {
		const cached = streamOptionsCapabilityMemo.get(channelId);
		if (cached) {
			return cached;
		}
		if (!c.env.KV_HOT) {
			streamOptionsCapabilityMemo.set(channelId, "unknown");
			return "unknown";
		}
		const key = buildStreamOptionsCapabilityKey(channelId);
		const record = await readHotJson<StreamOptionsCapabilityRecord>(
			c.env.KV_HOT,
			key,
		);
		const value =
			record && typeof record.supported === "boolean"
				? record.supported
					? "supported"
					: "unsupported"
				: "unknown";
		streamOptionsCapabilityMemo.set(channelId, value);
		return value;
	};
	const saveStreamOptionsCapability = (
		channelId: string,
		supported: boolean,
	): void => {
		streamOptionsCapabilityMemo.set(
			channelId,
			supported ? "supported" : "unsupported",
		);
		if (!c.env.KV_HOT) {
			return;
		}
		const key = buildStreamOptionsCapabilityKey(channelId);
		const record: StreamOptionsCapabilityRecord = {
			supported,
			updatedAt: new Date().toISOString(),
		};
		scheduleDbWrite(
			c,
			writeHotJson(
				c.env.KV_HOT,
				key,
				record,
				streamOptionsCapabilityTtlSeconds,
			),
		);
	};
	const dispatchAttempts: AttemptDispatchRequest[] = [];
	const dispatchAttemptMeta: Array<{
		channel: ChannelRecord;
		upstreamProvider: ProviderType;
		upstreamModel: string | null;
		recordModel: string | null;
		tokenSelection: CallTokenSelection;
		attemptStartedAt: string;
		streamOptionsHandled: boolean;
		target: string;
		fallbackTarget?: string;
		requestHeaders: Headers;
	}> = [];
	let dispatchHandled = false;
	let dispatchStopRetry = false;
	if (shouldTryLargeRequestDispatch) {
		for (const channel of ordered) {
			const attemptStart = Date.now();
			const attemptStartedAt = new Date(attemptStart).toISOString();
			const attemptTarget = resolveChannelAttemptTarget({
				channel,
				tokens: callTokenMap.get(channel.id) ?? [],
				downstreamModel,
				verifiedModelsByChannel,
				endpointType,
				downstreamProvider,
				selectionKey: `${traceId}:${channel.id}:${downstreamModel ?? "*"}`,
			});
			if (!attemptTarget.eligible) {
				continue;
			}
			const preparedAttempt = await prepareAttemptRequest({
				channel,
				attemptTarget,
				requestHeaders: new Headers(c.req.header()),
				targetPath,
				effectiveRequestText,
				parsedBody,
				downstreamProvider,
				endpointType,
				isStream,
				shouldSkipHeavyBodyParsing,
				querySuffix,
				upstreamTimeoutMs,
				streamUsageOptions,
				ensureNormalizedChat,
				ensureNormalizedEmbedding,
				ensureNormalizedImage,
				loadStreamOptionsCapability,
			});
			if (!preparedAttempt) {
				continue;
			}
			dispatchAttempts.push({
				channelId: channel.id,
				method: c.req.method,
				target: preparedAttempt.target,
				fallbackTarget: preparedAttempt.fallbackTarget,
				headers: Array.from(preparedAttempt.headers.entries()),
				bodyText: preparedAttempt.bodyText,
				timeoutMs: upstreamTimeoutMs,
				responsePath: preparedAttempt.responsePath,
				fallbackPath: preparedAttempt.fallbackPath,
				streamUsage: streamUsageOptions,
				streamOptionsInjected: preparedAttempt.streamOptionsInjected,
				strippedBodyText: preparedAttempt.strippedBodyText,
			});
			dispatchAttemptMeta.push({
				channel,
				upstreamProvider: preparedAttempt.upstreamProvider as ProviderType,
				upstreamModel: preparedAttempt.upstreamModel,
				recordModel: preparedAttempt.recordModel,
				tokenSelection: preparedAttempt.tokenSelection,
				attemptStartedAt,
				streamOptionsHandled: preparedAttempt.streamOptionsHandled,
				target: preparedAttempt.target,
				fallbackTarget: preparedAttempt.fallbackTarget,
				requestHeaders: new Headers(preparedAttempt.headers),
			});
		}
		if (dispatchAttempts.length > 0) {
			const dispatchResult = await executeDispatchViaWorker(
				c,
				{
					attempts: dispatchAttempts,
					retryConfig: dispatchRetryConfig,
					streamUsage: streamUsageOptions,
				},
				attemptBindingPolicy,
				attemptBindingState,
				downstreamSignal,
			);
			if (downstreamSignal.aborted) {
				return downstreamAbortResponse();
			}
			if (dispatchResult?.kind === "binding_error") {
				recordEarlyUsage({
					status: 503,
					code: dispatchResult.errorCode,
					message: dispatchResult.errorMessage,
					failureStage: "attempt_dispatch",
					failureReason: dispatchResult.errorCode,
					usageSource: "none",
					errorMetaJson: JSON.stringify({
						type: "attempt_worker_binding_error",
						latency_ms: dispatchResult.latencyMs,
					}),
				});
				return jsonErrorWithTrace(
					503,
					dispatchResult.errorCode,
					dispatchResult.errorCode,
				);
			}
			if (dispatchResult?.kind === "attempt_worker_error") {
				recordEarlyUsage({
					status: 503,
					code: dispatchResult.errorCode,
					message: dispatchResult.errorMessage,
					failureStage: "attempt_dispatch_worker",
					failureReason: dispatchResult.errorCode,
					usageSource: "none",
					errorMetaJson:
						dispatchResult.errorMetaJson ??
						JSON.stringify({
							type: "attempt_worker_internal_error",
							http_status: dispatchResult.httpStatus,
							latency_ms: dispatchResult.latencyMs,
						}),
				});
				return jsonErrorWithTrace(
					503,
					dispatchResult.errorCode,
					dispatchResult.errorCode,
				);
			}
			if (dispatchResult?.kind === "success") {
				dispatchHandled = true;
				dispatchStopRetry = dispatchResult.stopRetry;
				const resolvedIndex = Math.min(
					dispatchAttemptMeta.length - 1,
					Math.max(0, dispatchResult.attemptIndex),
				);
				const meta = dispatchAttemptMeta[resolvedIndex];
				if (meta) {
					const attemptNumber = resolvedIndex + 1;
					attemptsExecuted = Math.max(attemptsExecuted, attemptNumber);
					const response = dispatchResult.response;
					const responsePath = dispatchResult.responsePath;
					const attemptLatencyMs = dispatchResult.latencyMs;
					const attemptUpstreamRequestId = dispatchResult.upstreamRequestId;
					if (response.ok) {
						const hasUsageHeaderSignal = hasUsageHeaders(response.headers);
						const headerUsage = parseUsageFromHeaders(response.headers);
						let jsonUsage: NormalizedUsage | null = null;
						let hasUsageJsonSignal = false;
						if (
							!isStream &&
							response.headers.get("content-type")?.includes("application/json")
						) {
							const data = await response
								.clone()
								.json()
								.catch(() => null);
							hasUsageJsonSignal = hasUsageJsonHint(data);
							jsonUsage = parseUsageFromJson(data);
						}
						let immediateUsage = jsonUsage ?? headerUsage;
						const immediateUsageSource = jsonUsage
							? "json"
							: headerUsage
								? "header"
								: "none";
						const streamUsageProcessed = isStream
							? parseBooleanHeader(
									response.headers.get(ATTEMPT_STREAM_USAGE_PROCESSED_HEADER),
								)
							: false;
						let parsedSuccessStreamUsage: StreamUsage | null = null;
						if (isStream) {
							if (streamUsageProcessed) {
								parsedSuccessStreamUsage = {
									usage: headerUsage,
									firstTokenLatencyMs: parseOptionalLatencyHeader(
										response.headers.get(
											ATTEMPT_STREAM_FIRST_TOKEN_LATENCY_HEADER,
										),
									),
									eventsSeen:
										parseOptionalCountHeader(
											response.headers.get(ATTEMPT_STREAM_EVENTS_SEEN_HEADER),
										) ?? 0,
									abnormal: readAttemptStreamAbnormal(response.headers),
								};
								if (parsedSuccessStreamUsage?.usage) {
									immediateUsage = parsedSuccessStreamUsage.usage;
								}
							} else if (
								shouldParseSuccessStreamUsage(
									streamUsageMode as "full" | "lite" | "off",
								)
							) {
								parsedSuccessStreamUsage = await parseUsageFromSse(
									response.clone(),
									{
										...streamUsageOptions,
										timeoutMs: streamUsageParseTimeoutMs,
									},
								).catch(() => null);
								if (parsedSuccessStreamUsage?.usage) {
									immediateUsage = parsedSuccessStreamUsage.usage;
								}
							}
						}
						const abnormalResponse =
							parsedSuccessStreamUsage?.abnormal ??
							(await detectAbnormalSuccessResponse(response)) ??
							(isStream &&
							!parsedSuccessStreamUsage &&
							shouldParseSuccessStreamUsage(
								streamUsageMode as "full" | "lite" | "off",
							)
								? await detectAbnormalStreamSuccessResponse(response)
								: null);
						if (abnormalResponse) {
							const failureDecision = resolveFailureWithMeta({
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
								errorMetaJson: abnormalResponse.errorMetaJson,
							});
							lastErrorDetails = {
								upstreamStatus: response.status,
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
								errorMetaJson: failureDecision.errorMetaJson,
							};
							recordAttemptUsage({
								channelId: meta.channel.id,
								requestPath: responsePath,
								latencyMs: attemptLatencyMs,
								firstTokenLatencyMs: isStream ? null : attemptLatencyMs,
								usage: null,
								status: "error",
								upstreamStatus: response.status,
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
								failureStage: "upstream_response",
								failureReason: abnormalResponse.errorCode,
								usageSource: "none",
								errorMetaJson: failureDecision.errorMetaJson,
							});
							recordAttemptLog({
								attemptIndex: attemptNumber,
								channelId: meta.channel.id,
								provider: meta.upstreamProvider,
								model: meta.upstreamModel ?? downstreamModel,
								status: "error",
								errorClass: "upstream_response",
								errorCode: abnormalResponse.errorCode,
								httpStatus: response.status,
								latencyMs: attemptLatencyMs,
								upstreamRequestId: attemptUpstreamRequestId,
								startedAt: meta.attemptStartedAt,
								endedAt: new Date().toISOString(),
							});
							appendAttemptFailure({
								attemptIndex: attemptNumber,
								channel: meta.channel,
								httpStatus: response.status,
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
								latencyMs: attemptLatencyMs,
							});
							scheduleModelCooldown({
								channelId: meta.channel.id,
								model: meta.recordModel,
								upstreamStatus: response.status,
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
							});
							if (downstreamModel && downstreamModel !== meta.recordModel) {
								scheduleModelCooldown({
									channelId: meta.channel.id,
									model: downstreamModel,
									upstreamStatus: response.status,
									errorCode: abnormalResponse.errorCode,
									errorMessage: abnormalResponse.errorMessage,
								});
							}
							const action = failureDecision.action;
							if (action === "return") {
								return buildDirectErrorResponse(
									response.status,
									abnormalResponse.errorCode,
								);
							}
							if (action === "disable") {
								await applyDisableAction({
									channelId: meta.channel.id,
									errorCode: abnormalResponse.errorCode,
								});
							} else if (!(await continueAfterFailure(attemptNumber, action))) {
								dispatchStopRetry = true;
							}
						} else {
							const hasAnyUsageSignal =
								hasUsageHeaderSignal || hasUsageJsonSignal;
							const failOnMissingUsage = shouldTreatMissingUsageAsError({
								isStream,
								bodyParsingSkipped:
									shouldSkipHeavyBodyParsing && !parsedBodyInitialized,
								hasUsageSignal: hasAnyUsageSignal,
							});
							if (!isStream && !immediateUsage && failOnMissingUsage) {
								const usageMissing =
									buildUsageMissingFailure(hasAnyUsageSignal);
								const usageMissingCode = usageMissing.errorCode;
								const usageMissingMessage = usageMissing.errorMessage;
								const failureDecision = resolveFailureWithMeta({
									errorCode: usageMissingCode,
									errorMessage: usageMissingMessage,
								});
								lastErrorDetails = {
									upstreamStatus: response.status,
									errorCode: usageMissingCode,
									errorMessage: usageMissingMessage,
									errorMetaJson: failureDecision.errorMetaJson,
								};
								recordAttemptUsage({
									channelId: meta.channel.id,
									requestPath: responsePath,
									latencyMs: attemptLatencyMs,
									firstTokenLatencyMs: attemptLatencyMs,
									usage: null,
									status: "error",
									upstreamStatus: response.status,
									errorCode: usageMissingCode,
									errorMessage: usageMissingMessage,
									failureStage: "usage_finalize",
									failureReason: usageMissingCode,
									usageSource: immediateUsageSource,
									errorMetaJson: failureDecision.errorMetaJson,
								});
								recordAttemptLog({
									attemptIndex: attemptNumber,
									channelId: meta.channel.id,
									provider: meta.upstreamProvider,
									model: meta.upstreamModel ?? downstreamModel,
									status: "error",
									errorClass: "usage_finalize",
									errorCode: usageMissingCode,
									httpStatus: response.status,
									latencyMs: attemptLatencyMs,
									upstreamRequestId: attemptUpstreamRequestId,
									startedAt: meta.attemptStartedAt,
									endedAt: new Date().toISOString(),
								});
								appendAttemptFailure({
									attemptIndex: attemptNumber,
									channel: meta.channel,
									httpStatus: response.status,
									errorCode: usageMissingCode,
									errorMessage: usageMissingMessage,
									latencyMs: attemptLatencyMs,
								});
								const action = failureDecision.action;
								if (action === "return") {
									return buildDirectErrorResponse(
										response.status,
										usageMissingCode,
									);
								}
								if (action === "disable") {
									await applyDisableAction({
										channelId: meta.channel.id,
										errorCode: usageMissingCode,
									});
								} else if (
									!(await continueAfterFailure(attemptNumber, action))
								) {
									dispatchStopRetry = true;
								}
							} else if (
								shouldTreatZeroCompletionAsError({
									enabled: zeroCompletionAsErrorEnabled,
									endpointType,
									usage: immediateUsage,
								})
							) {
								const zeroCompletion = buildZeroCompletionFailure(
									immediateUsage?.completionTokens,
								);
								const zeroCompletionMessage = zeroCompletion.errorMessage;
								const failureDecision = resolveFailureWithMeta({
									errorCode: zeroCompletion.errorCode,
									errorMessage: zeroCompletionMessage,
								});
								lastErrorDetails = {
									upstreamStatus: response.status,
									errorCode: zeroCompletion.errorCode,
									errorMessage: zeroCompletionMessage,
									errorMetaJson: failureDecision.errorMetaJson,
								};
								recordAttemptUsage({
									channelId: meta.channel.id,
									requestPath: responsePath,
									latencyMs: attemptLatencyMs,
									firstTokenLatencyMs: attemptLatencyMs,
									usage: immediateUsage,
									status: "error",
									upstreamStatus: response.status,
									errorCode: zeroCompletion.errorCode,
									errorMessage: zeroCompletionMessage,
									failureStage: "usage_finalize",
									failureReason: zeroCompletion.errorCode,
									usageSource: immediateUsageSource,
									errorMetaJson: failureDecision.errorMetaJson,
								});
								recordAttemptLog({
									attemptIndex: attemptNumber,
									channelId: meta.channel.id,
									provider: meta.upstreamProvider,
									model: meta.upstreamModel ?? downstreamModel,
									status: "error",
									errorClass: "usage_finalize",
									errorCode: zeroCompletion.errorCode,
									httpStatus: response.status,
									latencyMs: attemptLatencyMs,
									upstreamRequestId: attemptUpstreamRequestId,
									startedAt: meta.attemptStartedAt,
									endedAt: new Date().toISOString(),
								});
								appendAttemptFailure({
									attemptIndex: attemptNumber,
									channel: meta.channel,
									httpStatus: response.status,
									errorCode: zeroCompletion.errorCode,
									errorMessage: zeroCompletionMessage,
									latencyMs: attemptLatencyMs,
								});
								const action = failureDecision.action;
								if (action === "return") {
									return buildDirectErrorResponse(
										response.status,
										zeroCompletion.errorCode,
									);
								}
								if (action === "disable") {
									await applyDisableAction({
										channelId: meta.channel.id,
										errorCode: zeroCompletion.errorCode,
									});
								} else if (
									!(await continueAfterFailure(attemptNumber, action))
								) {
									dispatchStopRetry = true;
								}
							} else {
								recordAttemptLog({
									attemptIndex: attemptNumber,
									channelId: meta.channel.id,
									provider: meta.upstreamProvider,
									model: meta.upstreamModel ?? downstreamModel,
									status: "ok",
									httpStatus: response.status,
									latencyMs: attemptLatencyMs,
									upstreamRequestId: attemptUpstreamRequestId,
									startedAt: meta.attemptStartedAt,
									endedAt: new Date().toISOString(),
								});
								const selectedState = buildSelectedAttemptState({
									channel: meta.channel,
									upstreamProvider: meta.upstreamProvider,
									responsePath,
									fallbackEndpointType: endpointType,
									upstreamModel: meta.upstreamModel,
									immediateUsage,
									immediateUsageSource,
									hasAnyUsageSignal,
									parsedSuccessStreamUsage,
									hasUsageHeaderSignal,
									attemptNumber,
									attemptStartedAt: meta.attemptStartedAt,
									attemptLatencyMs,
									attemptUpstreamRequestId,
									tokenSelection: meta.tokenSelection,
								});
								selectedChannel = selectedState.selectedChannel;
								selectedUpstreamProvider =
									selectedState.selectedUpstreamProvider;
								selectedUpstreamEndpoint =
									selectedState.selectedUpstreamEndpoint;
								selectedUpstreamModel = selectedState.selectedUpstreamModel;
								selectedResponse = response;
								selectedRequestPath = selectedState.selectedRequestPath;
								selectedImmediateUsage = selectedState.selectedImmediateUsage;
								selectedImmediateUsageSource =
									selectedState.selectedImmediateUsageSource;
								selectedHasUsageSignal = selectedState.selectedHasUsageSignal;
								selectedParsedStreamUsage =
									selectedState.selectedParsedStreamUsage;
								selectedHasUsageHeaders = selectedState.selectedHasUsageHeaders;
								selectedAttemptTokenId = selectedState.selectedAttemptTokenId;
								selectedAttemptTokenName =
									selectedState.selectedAttemptTokenName;
								selectedAttemptIndex = selectedState.selectedAttemptIndex;
								selectedAttemptStartedAt =
									selectedState.selectedAttemptStartedAt;
								selectedAttemptLatencyMs =
									selectedState.selectedAttemptLatencyMs;
								selectedAttemptUpstreamRequestId =
									selectedState.selectedAttemptUpstreamRequestId;
								lastErrorDetails = null;
								if (meta.recordModel) {
									scheduleUsageEvent({
										type: "capability_upsert",
										payload: {
											channelId: meta.channel.id,
											models: [meta.recordModel],
											nowSeconds,
										},
									});
								}
							}
						}
					} else {
						const errorInfo = await extractErrorDetails(response);
						const errorMetaJson = mergeErrorMetaJson(
							errorInfo.errorMetaJson,
							buildUpstreamDiagnosticMeta({
								target: meta.target,
								fallbackTarget: meta.fallbackTarget,
								requestHeaders: meta.requestHeaders,
								response,
							}),
						);
						const failureUsage = await parseStreamUsageOnFailure(response);
						const evaluatedFailure = evaluateUpstreamHttpFailure({
							errorCode: errorInfo.errorCode,
							errorMessage: errorInfo.errorMessage,
							responseStatus: response.status,
							errorMetaJson,
							downstreamProvider,
							hasResponsesFunctionCallOutput:
								responsesRequestHints?.hasFunctionCallOutput === true,
							hasChatToolOutput,
							streamOptionsHandled: meta.streamOptionsHandled,
						});
						if (evaluatedFailure.responsesToolCallMismatch) {
							responsesToolCallMismatchChannels.push(meta.channel.id);
						}
						const failureDecision = resolveFailureWithMeta({
							errorCode: evaluatedFailure.finalErrorCode,
							errorMessage: evaluatedFailure.normalizedErrorMessage,
							errorMetaJson: evaluatedFailure.errorMetaJson,
							overrideAction:
								dispatchResult.errorAction !== "retry"
									? dispatchResult.errorAction
									: null,
						});
						lastErrorDetails = {
							upstreamStatus: response.status,
							errorCode: evaluatedFailure.finalErrorCode,
							errorMessage: evaluatedFailure.normalizedErrorMessage,
							errorMetaJson: failureDecision.errorMetaJson,
						};
						recordAttemptUsage({
							channelId: meta.channel.id,
							requestPath: responsePath,
							latencyMs: attemptLatencyMs,
							firstTokenLatencyMs: isStream ? null : attemptLatencyMs,
							usage: failureUsage.usage,
							status: "error",
							upstreamStatus: response.status,
							errorCode: evaluatedFailure.finalErrorCode,
							errorMessage: evaluatedFailure.normalizedErrorMessage,
							failureStage: "upstream_response",
							failureReason: evaluatedFailure.finalErrorCode,
							usageSource: failureUsage.usageSource,
							errorMetaJson: failureDecision.errorMetaJson,
						});
						recordAttemptLog({
							attemptIndex: attemptNumber,
							channelId: meta.channel.id,
							provider: meta.upstreamProvider,
							model: meta.upstreamModel ?? downstreamModel,
							status: "error",
							errorClass: evaluatedFailure.errorClass,
							errorCode: evaluatedFailure.finalErrorCode,
							httpStatus: response.status,
							latencyMs: attemptLatencyMs,
							upstreamRequestId: attemptUpstreamRequestId,
							startedAt: meta.attemptStartedAt,
							endedAt: new Date().toISOString(),
						});
						appendAttemptFailure({
							attemptIndex: attemptNumber,
							channel: meta.channel,
							httpStatus: response.status,
							errorCode: evaluatedFailure.finalErrorCode,
							errorMessage: evaluatedFailure.normalizedErrorMessage,
							latencyMs: attemptLatencyMs,
						});
						scheduleModelCooldown({
							channelId: meta.channel.id,
							model: meta.recordModel,
							upstreamStatus: response.status,
							errorCode: evaluatedFailure.finalErrorCode,
							errorMessage: evaluatedFailure.normalizedErrorMessage,
						});
						if (downstreamModel && downstreamModel !== meta.recordModel) {
							scheduleModelCooldown({
								channelId: meta.channel.id,
								model: downstreamModel,
								upstreamStatus: response.status,
								errorCode: evaluatedFailure.finalErrorCode,
								errorMessage: evaluatedFailure.normalizedErrorMessage,
							});
						}
						const action = failureDecision.action;
						if (action === "return") {
							return buildDirectErrorResponse(
								response.status,
								evaluatedFailure.finalErrorCode,
							);
						}
						if (action === "disable") {
							await applyDisableAction({
								channelId: meta.channel.id,
								errorCode: evaluatedFailure.finalErrorCode,
							});
						}
					}
				}
			}
		}
	}
	if (downstreamSignal.aborted) {
		recordSelectedClientDisconnect();
		return downstreamAbortResponse();
	}
	if (dispatchHandled && !selectedResponse && !dispatchStopRetry) {
		dispatchHandled = false;
	}
	if (!dispatchHandled) {
		for (const [attemptIndex, channel] of ordered.entries()) {
			if (downstreamSignal.aborted) {
				return downstreamAbortResponse();
			}
			if (
				attemptIndex < attemptsExecuted ||
				blockedChannelIds.has(channel.id)
			) {
				continue;
			}
			const attemptNumber = attemptIndex + 1;
			const attemptTarget = resolveChannelAttemptTarget({
				channel,
				tokens: callTokenMap.get(channel.id) ?? [],
				downstreamModel,
				verifiedModelsByChannel,
				endpointType,
				downstreamProvider,
				selectionKey: `${traceId}:${channel.id}:${downstreamModel ?? "*"}`,
				selectionOffset: attemptNumber - 1,
			});
			if (!attemptTarget.eligible) {
				continue;
			}
			attemptsExecuted = Math.max(attemptsExecuted, attemptNumber);
			const attemptStart = Date.now();
			const attemptStartedAt = new Date(attemptStart).toISOString();
			const preparedAttempt = await prepareAttemptRequest({
				channel,
				attemptTarget,
				requestHeaders: new Headers(c.req.header()),
				targetPath,
				effectiveRequestText,
				parsedBody,
				downstreamProvider,
				endpointType,
				isStream,
				shouldSkipHeavyBodyParsing,
				querySuffix,
				upstreamTimeoutMs,
				streamUsageOptions,
				ensureNormalizedChat,
				ensureNormalizedEmbedding,
				ensureNormalizedImage,
				loadStreamOptionsCapability,
			});
			if (!preparedAttempt) {
				continue;
			}
			const upstreamProvider = preparedAttempt.upstreamProvider as ProviderType;
			const upstreamModel = preparedAttempt.upstreamModel;
			const recordModel = preparedAttempt.recordModel;
			const tokenSelection = preparedAttempt.tokenSelection;
			const headers = preparedAttempt.headers;
			const upstreamRequestPath = preparedAttempt.responsePath;
			const upstreamFallbackPath = preparedAttempt.fallbackPath;
			const upstreamBodyText = preparedAttempt.bodyText;
			const shouldHandleStreamOptions = preparedAttempt.streamOptionsHandled;
			const streamOptionsInjected = preparedAttempt.streamOptionsInjected;
			const strippedStreamOptionsBodyText = preparedAttempt.strippedBodyText;
			const target = preparedAttempt.target;

			try {
				const fallbackTarget = preparedAttempt.fallbackTarget;

				const attemptResult = await executeAttemptViaWorker(
					c,
					{
						method: c.req.method,
						target,
						fallbackTarget,
						headers: Array.from(headers.entries()),
						bodyText: upstreamBodyText,
						timeoutMs: upstreamTimeoutMs,
						responsePath: upstreamRequestPath,
						fallbackPath: upstreamFallbackPath,
						streamUsage: streamUsageOptions,
					},
					attemptBindingPolicy,
					attemptBindingState,
					downstreamSignal,
				);
				if (attemptResult.kind === "aborted" || downstreamSignal.aborted) {
					return downstreamAbortResponse();
				}
				if (
					attemptResult.kind === "binding_error" ||
					attemptResult.kind === "attempt_worker_error"
				) {
					const errorMetaJson =
						attemptResult.kind === "attempt_worker_error"
							? (attemptResult.errorMetaJson ??
								JSON.stringify({
									type: "attempt_worker_internal_error",
									http_status: attemptResult.httpStatus,
									latency_ms: attemptResult.latencyMs,
								}))
							: JSON.stringify({
									type: "attempt_worker_binding_error",
									latency_ms: attemptResult.latencyMs,
								});
					lastErrorDetails = {
						upstreamStatus: null,
						errorCode: attemptResult.errorCode,
						errorMessage: attemptResult.errorMessage,
						errorMetaJson,
					};
					const failureDecision = resolveFailureWithMeta({
						errorCode: attemptResult.errorCode,
						errorMessage: attemptResult.errorMessage,
						errorMetaJson,
					});
					lastErrorDetails.errorMetaJson = failureDecision.errorMetaJson;
					recordAttemptUsage({
						channelId: channel.id,
						requestPath: upstreamRequestPath,
						latencyMs: attemptResult.latencyMs,
						firstTokenLatencyMs: null,
						usage: null,
						status: "error",
						upstreamStatus: null,
						errorCode: attemptResult.errorCode,
						errorMessage: attemptResult.errorMessage,
						failureStage: "attempt_call",
						failureReason: attemptResult.errorCode,
						usageSource: "none",
						errorMetaJson: failureDecision.errorMetaJson,
					});
					recordAttemptLog({
						attemptIndex: attemptNumber,
						channelId: channel.id,
						provider: upstreamProvider,
						model: upstreamModel ?? downstreamModel,
						status: "error",
						errorClass:
							attemptResult.kind === "attempt_worker_error"
								? "attempt_worker"
								: "attempt_binding",
						errorCode: attemptResult.errorCode,
						httpStatus:
							attemptResult.kind === "attempt_worker_error"
								? attemptResult.httpStatus
								: null,
						latencyMs: attemptResult.latencyMs,
						startedAt: attemptStartedAt,
						endedAt: new Date().toISOString(),
					});
					appendAttemptFailure({
						attemptIndex: attemptNumber,
						channel,
						httpStatus:
							attemptResult.kind === "attempt_worker_error"
								? attemptResult.httpStatus
								: null,
						errorCode: attemptResult.errorCode,
						errorMessage: attemptResult.errorMessage,
						latencyMs: attemptResult.latencyMs,
					});
					const action = failureDecision.action;
					if (action === "return") {
						return buildDirectErrorResponse(
							attemptResult.kind === "attempt_worker_error"
								? attemptResult.httpStatus
								: 503,
							attemptResult.errorCode,
						);
					}
					if (action === "disable") {
						await applyDisableAction({
							channelId: channel.id,
							errorCode: attemptResult.errorCode,
						});
						continue;
					}
					if (!(await continueAfterFailure(attemptNumber, action))) {
						break;
					}
					continue;
				}
				let {
					response,
					responsePath,
					latencyMs: attemptLatencyMs,
					upstreamRequestId: attemptUpstreamRequestId,
				} = attemptResult;

				if (
					shouldHandleStreamOptions &&
					streamOptionsInjected &&
					!response.ok
				) {
					const details = await extractErrorDetails(response);
					if (isStreamOptionsUnsupportedMessage(details.errorMessage)) {
						saveStreamOptionsCapability(channel.id, false);
						const retried = await executeAttemptViaWorker(
							c,
							{
								method: c.req.method,
								target,
								fallbackTarget,
								headers: Array.from(headers.entries()),
								bodyText: strippedStreamOptionsBodyText,
								timeoutMs: upstreamTimeoutMs,
								responsePath: upstreamRequestPath,
								fallbackPath: upstreamFallbackPath,
								streamUsage: streamUsageOptions,
							},
							attemptBindingPolicy,
							attemptBindingState,
							downstreamSignal,
						);
						if (retried.kind === "aborted" || downstreamSignal.aborted) {
							return downstreamAbortResponse();
						}
						if (
							retried.kind === "binding_error" ||
							retried.kind === "attempt_worker_error"
						) {
							const errorMetaJson =
								retried.kind === "attempt_worker_error"
									? (retried.errorMetaJson ??
										JSON.stringify({
											type: "attempt_worker_internal_error",
											http_status: retried.httpStatus,
											latency_ms: retried.latencyMs,
										}))
									: JSON.stringify({
											type: "attempt_worker_binding_error",
											latency_ms: retried.latencyMs,
										});
							lastErrorDetails = {
								upstreamStatus: null,
								errorCode: retried.errorCode,
								errorMessage: retried.errorMessage,
								errorMetaJson,
							};
							const failureDecision = resolveFailureWithMeta({
								errorCode: retried.errorCode,
								errorMessage: retried.errorMessage,
								errorMetaJson,
							});
							lastErrorDetails.errorMetaJson = failureDecision.errorMetaJson;
							recordAttemptUsage({
								channelId: channel.id,
								requestPath: upstreamRequestPath,
								latencyMs: retried.latencyMs,
								firstTokenLatencyMs: null,
								usage: null,
								status: "error",
								upstreamStatus: null,
								errorCode: retried.errorCode,
								errorMessage: retried.errorMessage,
								failureStage: "attempt_call",
								failureReason: retried.errorCode,
								usageSource: "none",
								errorMetaJson: failureDecision.errorMetaJson,
							});
							recordAttemptLog({
								attemptIndex: attemptNumber,
								channelId: channel.id,
								provider: upstreamProvider,
								model: upstreamModel ?? downstreamModel,
								status: "error",
								errorClass:
									retried.kind === "attempt_worker_error"
										? "attempt_worker"
										: "attempt_binding",
								errorCode: retried.errorCode,
								httpStatus:
									retried.kind === "attempt_worker_error"
										? retried.httpStatus
										: null,
								latencyMs: retried.latencyMs,
								startedAt: attemptStartedAt,
								endedAt: new Date().toISOString(),
							});
							appendAttemptFailure({
								attemptIndex: attemptNumber,
								channel,
								httpStatus:
									retried.kind === "attempt_worker_error"
										? retried.httpStatus
										: null,
								errorCode: retried.errorCode,
								errorMessage: retried.errorMessage,
								latencyMs: retried.latencyMs,
							});
							const action = failureDecision.action;
							if (action === "return") {
								return buildDirectErrorResponse(
									retried.kind === "attempt_worker_error"
										? retried.httpStatus
										: 503,
									retried.errorCode,
								);
							}
							if (action === "disable") {
								await applyDisableAction({
									channelId: channel.id,
									errorCode: retried.errorCode,
								});
								continue;
							}
							if (!(await continueAfterFailure(attemptNumber, action))) {
								break;
							}
							continue;
						}
						response = retried.response;
						responsePath = retried.responsePath;
						attemptLatencyMs = retried.latencyMs;
						attemptUpstreamRequestId = retried.upstreamRequestId;
					}
				}
				if (shouldHandleStreamOptions && response.ok && streamOptionsInjected) {
					saveStreamOptionsCapability(channel.id, true);
				}

				if (response.ok) {
					const hasUsageHeaderSignal = hasUsageHeaders(response.headers);
					const headerUsage = parseUsageFromHeaders(response.headers);
					let jsonUsage: NormalizedUsage | null = null;
					let hasUsageJsonSignal = false;
					if (
						!isStream &&
						response.headers.get("content-type")?.includes("application/json")
					) {
						const data = await response
							.clone()
							.json()
							.catch(() => null);
						hasUsageJsonSignal = hasUsageJsonHint(data);
						jsonUsage = parseUsageFromJson(data);
					}
					let immediateUsage = jsonUsage ?? headerUsage;
					const immediateUsageSource = jsonUsage
						? "json"
						: headerUsage
							? "header"
							: "none";
					const streamUsageProcessed = isStream
						? parseBooleanHeader(
								response.headers.get(ATTEMPT_STREAM_USAGE_PROCESSED_HEADER),
							)
						: false;
					let parsedSuccessStreamUsage: StreamUsage | null = null;
					if (isStream) {
						if (streamUsageProcessed) {
							parsedSuccessStreamUsage = {
								usage: headerUsage,
								firstTokenLatencyMs: parseOptionalLatencyHeader(
									response.headers.get(
										ATTEMPT_STREAM_FIRST_TOKEN_LATENCY_HEADER,
									),
								),
								eventsSeen:
									parseOptionalCountHeader(
										response.headers.get(ATTEMPT_STREAM_EVENTS_SEEN_HEADER),
									) ?? 0,
								abnormal: readAttemptStreamAbnormal(response.headers),
							};
							if (parsedSuccessStreamUsage?.usage) {
								immediateUsage = parsedSuccessStreamUsage.usage;
							}
						} else if (
							shouldParseSuccessStreamUsage(
								streamUsageMode as "full" | "lite" | "off",
							)
						) {
							parsedSuccessStreamUsage = await parseUsageFromSse(
								response.clone(),
								{
									...streamUsageOptions,
									timeoutMs: streamUsageParseTimeoutMs,
								},
							).catch(() => null);
							if (parsedSuccessStreamUsage?.usage) {
								immediateUsage = parsedSuccessStreamUsage.usage;
							}
						}
					}
					const abnormalResponse =
						parsedSuccessStreamUsage?.abnormal ??
						(await detectAbnormalSuccessResponse(response)) ??
						(isStream &&
						!parsedSuccessStreamUsage &&
						shouldParseSuccessStreamUsage(
							streamUsageMode as "full" | "lite" | "off",
						)
							? await detectAbnormalStreamSuccessResponse(response)
							: null);
					if (abnormalResponse) {
						const failureDecision = resolveFailureWithMeta({
							errorCode: abnormalResponse.errorCode,
							errorMessage: abnormalResponse.errorMessage,
							errorMetaJson: abnormalResponse.errorMetaJson,
						});
						lastErrorDetails = {
							upstreamStatus: response.status,
							errorCode: abnormalResponse.errorCode,
							errorMessage: abnormalResponse.errorMessage,
							errorMetaJson: failureDecision.errorMetaJson,
						};
						recordAttemptUsage({
							channelId: channel.id,
							requestPath: responsePath,
							latencyMs: attemptLatencyMs,
							firstTokenLatencyMs: isStream ? null : attemptLatencyMs,
							usage: null,
							status: "error",
							upstreamStatus: response.status,
							errorCode: abnormalResponse.errorCode,
							errorMessage: abnormalResponse.errorMessage,
							failureStage: "upstream_response",
							failureReason: abnormalResponse.errorCode,
							usageSource: "none",
							errorMetaJson: failureDecision.errorMetaJson,
						});
						recordAttemptLog({
							attemptIndex: attemptNumber,
							channelId: channel.id,
							provider: upstreamProvider,
							model: upstreamModel ?? downstreamModel,
							status: "error",
							errorClass: "upstream_response",
							errorCode: abnormalResponse.errorCode,
							httpStatus: response.status,
							latencyMs: attemptLatencyMs,
							upstreamRequestId: attemptUpstreamRequestId,
							startedAt: attemptStartedAt,
							endedAt: new Date().toISOString(),
						});
						appendAttemptFailure({
							attemptIndex: attemptNumber,
							channel,
							httpStatus: response.status,
							errorCode: abnormalResponse.errorCode,
							errorMessage: abnormalResponse.errorMessage,
							latencyMs: attemptLatencyMs,
						});
						scheduleModelCooldown({
							channelId: channel.id,
							model: recordModel,
							upstreamStatus: response.status,
							errorCode: abnormalResponse.errorCode,
							errorMessage: abnormalResponse.errorMessage,
						});
						if (downstreamModel && downstreamModel !== recordModel) {
							scheduleModelCooldown({
								channelId: channel.id,
								model: downstreamModel,
								upstreamStatus: response.status,
								errorCode: abnormalResponse.errorCode,
								errorMessage: abnormalResponse.errorMessage,
							});
						}
						const action = failureDecision.action;
						if (action === "return") {
							return buildDirectErrorResponse(
								response.status,
								abnormalResponse.errorCode,
							);
						}
						if (action === "disable") {
							await applyDisableAction({
								channelId: channel.id,
								errorCode: abnormalResponse.errorCode,
							});
							continue;
						}
						if (!(await continueAfterFailure(attemptNumber, action))) {
							break;
						}
						continue;
					}
					const hasAnyUsageSignal = hasUsageHeaderSignal || hasUsageJsonSignal;
					const failOnMissingUsage = shouldTreatMissingUsageAsError({
						isStream,
						bodyParsingSkipped:
							shouldSkipHeavyBodyParsing && !parsedBodyInitialized,
						hasUsageSignal: hasAnyUsageSignal,
					});
					if (!isStream && !immediateUsage && failOnMissingUsage) {
						const usageMissing = buildUsageMissingFailure(hasAnyUsageSignal);
						const usageMissingCode = usageMissing.errorCode;
						const usageMissingMessage = usageMissing.errorMessage;
						const failureDecision = resolveFailureWithMeta({
							errorCode: usageMissingCode,
							errorMessage: usageMissingMessage,
						});
						lastErrorDetails = {
							upstreamStatus: response.status,
							errorCode: usageMissingCode,
							errorMessage: usageMissingMessage,
							errorMetaJson: failureDecision.errorMetaJson,
						};
						recordAttemptUsage({
							channelId: channel.id,
							requestPath: responsePath,
							latencyMs: attemptLatencyMs,
							firstTokenLatencyMs: attemptLatencyMs,
							usage: null,
							status: "error",
							upstreamStatus: response.status,
							errorCode: usageMissingCode,
							errorMessage: usageMissingMessage,
							failureStage: "usage_finalize",
							failureReason: usageMissingCode,
							usageSource: immediateUsageSource,
							errorMetaJson: failureDecision.errorMetaJson,
						});
						recordAttemptLog({
							attemptIndex: attemptNumber,
							channelId: channel.id,
							provider: upstreamProvider,
							model: upstreamModel ?? downstreamModel,
							status: "error",
							errorClass: "usage_finalize",
							errorCode: usageMissingCode,
							httpStatus: response.status,
							latencyMs: attemptLatencyMs,
							upstreamRequestId: attemptUpstreamRequestId,
							startedAt: attemptStartedAt,
							endedAt: new Date().toISOString(),
						});
						appendAttemptFailure({
							attemptIndex: attemptNumber,
							channel,
							httpStatus: response.status,
							errorCode: usageMissingCode,
							errorMessage: usageMissingMessage,
							latencyMs: attemptLatencyMs,
						});
						const action = failureDecision.action;
						if (action === "return") {
							return buildDirectErrorResponse(
								response.status,
								usageMissingCode,
							);
						}
						if (action === "disable") {
							await applyDisableAction({
								channelId: channel.id,
								errorCode: usageMissingCode,
							});
							continue;
						}
						if (!(await continueAfterFailure(attemptNumber, action))) {
							break;
						}
						continue;
					}
					if (
						shouldTreatZeroCompletionAsError({
							enabled: zeroCompletionAsErrorEnabled,
							endpointType,
							usage: immediateUsage,
						})
					) {
						const zeroCompletion = buildZeroCompletionFailure(
							immediateUsage?.completionTokens,
						);
						const zeroCompletionMessage = zeroCompletion.errorMessage;
						const failureDecision = resolveFailureWithMeta({
							errorCode: zeroCompletion.errorCode,
							errorMessage: zeroCompletionMessage,
						});
						lastErrorDetails = {
							upstreamStatus: response.status,
							errorCode: zeroCompletion.errorCode,
							errorMessage: zeroCompletionMessage,
							errorMetaJson: failureDecision.errorMetaJson,
						};
						recordAttemptUsage({
							channelId: channel.id,
							requestPath: responsePath,
							latencyMs: attemptLatencyMs,
							firstTokenLatencyMs: attemptLatencyMs,
							usage: immediateUsage,
							status: "error",
							upstreamStatus: response.status,
							errorCode: zeroCompletion.errorCode,
							errorMessage: zeroCompletionMessage,
							failureStage: "usage_finalize",
							failureReason: zeroCompletion.errorCode,
							usageSource: immediateUsageSource,
							errorMetaJson: failureDecision.errorMetaJson,
						});
						recordAttemptLog({
							attemptIndex: attemptNumber,
							channelId: channel.id,
							provider: upstreamProvider,
							model: upstreamModel ?? downstreamModel,
							status: "error",
							errorClass: "usage_finalize",
							errorCode: zeroCompletion.errorCode,
							httpStatus: response.status,
							latencyMs: attemptLatencyMs,
							upstreamRequestId: attemptUpstreamRequestId,
							startedAt: attemptStartedAt,
							endedAt: new Date().toISOString(),
						});
						appendAttemptFailure({
							attemptIndex: attemptNumber,
							channel,
							httpStatus: response.status,
							errorCode: zeroCompletion.errorCode,
							errorMessage: zeroCompletionMessage,
							latencyMs: attemptLatencyMs,
						});
						const action = failureDecision.action;
						if (action === "return") {
							return buildDirectErrorResponse(
								response.status,
								zeroCompletion.errorCode,
							);
						}
						if (action === "disable") {
							await applyDisableAction({
								channelId: channel.id,
								errorCode: zeroCompletion.errorCode,
							});
							continue;
						}
						if (!(await continueAfterFailure(attemptNumber, action))) {
							break;
						}
						continue;
					}

					recordAttemptLog({
						attemptIndex: attemptNumber,
						channelId: channel.id,
						provider: upstreamProvider,
						model: upstreamModel ?? downstreamModel,
						status: "ok",
						httpStatus: response.status,
						latencyMs: attemptLatencyMs,
						upstreamRequestId: attemptUpstreamRequestId,
						startedAt: attemptStartedAt,
						endedAt: new Date().toISOString(),
					});
					const selectedState = buildSelectedAttemptState({
						channel,
						upstreamProvider,
						responsePath,
						fallbackEndpointType: endpointType,
						upstreamModel,
						immediateUsage,
						immediateUsageSource,
						hasAnyUsageSignal,
						parsedSuccessStreamUsage,
						hasUsageHeaderSignal,
						attemptNumber,
						attemptStartedAt,
						attemptLatencyMs,
						attemptUpstreamRequestId,
					});
					selectedChannel = selectedState.selectedChannel;
					selectedUpstreamProvider = selectedState.selectedUpstreamProvider;
					selectedUpstreamEndpoint = selectedState.selectedUpstreamEndpoint;
					selectedUpstreamModel = selectedState.selectedUpstreamModel;
					selectedResponse = response;
					selectedRequestPath = selectedState.selectedRequestPath;
					selectedImmediateUsage = selectedState.selectedImmediateUsage;
					selectedImmediateUsageSource =
						selectedState.selectedImmediateUsageSource;
					selectedHasUsageSignal = selectedState.selectedHasUsageSignal;
					selectedParsedStreamUsage = selectedState.selectedParsedStreamUsage;
					selectedHasUsageHeaders = selectedState.selectedHasUsageHeaders;
					selectedAttemptIndex = selectedState.selectedAttemptIndex;
					selectedAttemptStartedAt = selectedState.selectedAttemptStartedAt;
					selectedAttemptLatencyMs = selectedState.selectedAttemptLatencyMs;
					selectedAttemptUpstreamRequestId =
						selectedState.selectedAttemptUpstreamRequestId;
					lastErrorDetails = null;
					if (recordModel) {
						scheduleUsageEvent({
							type: "capability_upsert",
							payload: {
								channelId: channel.id,
								models: [recordModel],
								nowSeconds,
							},
						});
					}
					break;
				}

				const errorInfo = await extractErrorDetails(response);
				const errorMetaJson = mergeErrorMetaJson(
					errorInfo.errorMetaJson,
					buildUpstreamDiagnosticMeta({
						target,
						fallbackTarget,
						requestHeaders: headers,
						response,
					}),
				);
				const failureUsage = await parseStreamUsageOnFailure(response);
				const evaluatedFailure = evaluateUpstreamHttpFailure({
					errorCode: errorInfo.errorCode,
					errorMessage: errorInfo.errorMessage,
					responseStatus: response.status,
					errorMetaJson,
					downstreamProvider,
					hasResponsesFunctionCallOutput:
						responsesRequestHints?.hasFunctionCallOutput === true,
					hasChatToolOutput,
					streamOptionsHandled: shouldHandleStreamOptions,
				});
				if (evaluatedFailure.responsesToolCallMismatch) {
					responsesToolCallMismatchChannels.push(channel.id);
				}
				const failureDecision = resolveFailureWithMeta({
					errorCode: evaluatedFailure.finalErrorCode,
					errorMessage: evaluatedFailure.normalizedErrorMessage,
					errorMetaJson: evaluatedFailure.errorMetaJson,
				});
				lastErrorDetails = {
					upstreamStatus: response.status,
					errorCode: evaluatedFailure.finalErrorCode,
					errorMessage: evaluatedFailure.normalizedErrorMessage,
					errorMetaJson: failureDecision.errorMetaJson,
				};
				recordAttemptUsage({
					channelId: channel.id,
					requestPath: responsePath,
					latencyMs: attemptLatencyMs,
					firstTokenLatencyMs: isStream ? null : attemptLatencyMs,
					usage: failureUsage.usage,
					status: "error",
					upstreamStatus: response.status,
					errorCode: evaluatedFailure.finalErrorCode,
					errorMessage: evaluatedFailure.normalizedErrorMessage,
					failureStage: "upstream_response",
					failureReason: evaluatedFailure.finalErrorCode,
					usageSource: failureUsage.usageSource,
					errorMetaJson: failureDecision.errorMetaJson,
				});
				recordAttemptLog({
					attemptIndex: attemptNumber,
					channelId: channel.id,
					provider: upstreamProvider,
					model: upstreamModel ?? downstreamModel,
					status: "error",
					errorClass: evaluatedFailure.errorClass,
					errorCode: evaluatedFailure.finalErrorCode,
					httpStatus: response.status,
					latencyMs: attemptLatencyMs,
					upstreamRequestId: attemptUpstreamRequestId,
					startedAt: attemptStartedAt,
					endedAt: new Date().toISOString(),
				});
				appendAttemptFailure({
					attemptIndex: attemptNumber,
					channel,
					httpStatus: response.status,
					errorCode: evaluatedFailure.finalErrorCode,
					errorMessage: evaluatedFailure.normalizedErrorMessage,
					latencyMs: attemptLatencyMs,
				});

				scheduleModelCooldown({
					channelId: channel.id,
					model: recordModel,
					upstreamStatus: response.status,
					errorCode: evaluatedFailure.finalErrorCode,
					errorMessage: evaluatedFailure.normalizedErrorMessage,
				});
				if (downstreamModel && downstreamModel !== recordModel) {
					scheduleModelCooldown({
						channelId: channel.id,
						model: downstreamModel,
						upstreamStatus: response.status,
						errorCode: evaluatedFailure.finalErrorCode,
						errorMessage: evaluatedFailure.normalizedErrorMessage,
					});
				}
				const action = failureDecision.action;
				if (action === "return") {
					return buildDirectErrorResponse(
						response.status,
						evaluatedFailure.finalErrorCode,
					);
				}
				if (action === "disable") {
					await applyDisableAction({
						channelId: channel.id,
						errorCode: evaluatedFailure.finalErrorCode,
					});
					continue;
				}
				if (!(await continueAfterFailure(attemptNumber, action))) {
					break;
				}
			} catch (error) {
				if (downstreamSignal.aborted) {
					return downstreamAbortResponse();
				}
				const fetchFailure = buildFetchExceptionFailure({
					error,
					maxLength: usageErrorMessageMaxLength,
					timeoutErrorCode: PROXY_UPSTREAM_TIMEOUT_ERROR_CODE,
					fetchErrorCode: PROXY_UPSTREAM_FETCH_ERROR_CODE,
				});
				const usageErrorCode = fetchFailure.errorCode;
				const usageErrorMessage = fetchFailure.errorMessage;
				const attemptLatencyMs = Date.now() - attemptStart;
				const failureDecision = resolveFailureWithMeta({
					errorCode: usageErrorCode,
					errorMessage: usageErrorMessage,
					errorMetaJson: fetchFailure.errorMetaJson,
				});
				lastErrorDetails = {
					upstreamStatus: null,
					errorCode: usageErrorCode,
					errorMessage: usageErrorMessage,
					errorMetaJson: failureDecision.errorMetaJson,
				};
				recordAttemptUsage({
					channelId: channel.id,
					requestPath: upstreamRequestPath,
					latencyMs: attemptLatencyMs,
					firstTokenLatencyMs: null,
					usage: null,
					status: "error",
					upstreamStatus: null,
					errorCode: lastErrorDetails.errorCode,
					errorMessage: lastErrorDetails.errorMessage,
					failureStage: "upstream_call",
					failureReason: usageErrorCode,
					usageSource: "none",
					errorMetaJson: failureDecision.errorMetaJson,
				});
				recordAttemptLog({
					attemptIndex: attemptNumber,
					channelId: channel.id,
					provider: upstreamProvider,
					model: upstreamModel ?? downstreamModel,
					status: "error",
					errorClass: fetchFailure.isTimeout ? "timeout" : "exception",
					errorCode: usageErrorCode,
					httpStatus: null,
					latencyMs: attemptLatencyMs,
					startedAt: attemptStartedAt,
					endedAt: new Date().toISOString(),
				});
				appendAttemptFailure({
					attemptIndex: attemptNumber,
					channel,
					httpStatus: null,
					errorCode: usageErrorCode,
					errorMessage: usageErrorMessage,
					latencyMs: attemptLatencyMs,
				});

				scheduleModelCooldown({
					channelId: channel.id,
					model: recordModel,
					upstreamStatus: null,
					errorCode: usageErrorCode,
					errorMessage: usageErrorMessage,
				});
				if (downstreamModel && downstreamModel !== recordModel) {
					scheduleModelCooldown({
						channelId: channel.id,
						model: downstreamModel,
						upstreamStatus: null,
						errorCode: usageErrorCode,
						errorMessage: usageErrorMessage,
					});
				}
				const action = failureDecision.action;
				if (action === "return") {
					return buildDirectErrorResponse(
						fetchFailure.isTimeout ? 504 : 502,
						usageErrorCode,
					);
				}
				if (action === "disable") {
					await applyDisableAction({
						channelId: channel.id,
						errorCode: usageErrorCode,
					});
					continue;
				}
				if (!(await continueAfterFailure(attemptNumber, action))) {
					break;
				}
			}
		}
	}
	if (downstreamSignal.aborted) {
		recordSelectedClientDisconnect();
		return downstreamAbortResponse();
	}

	const failureResponse = buildAttemptFailureResponse({
		c,
		selectedResponse,
		attemptsExecuted,
		attemptFailures,
		ordered,
		traceId,
		responsesToolCallMismatchChannels,
		withTraceHeader,
		jsonErrorWithTrace,
		lastErrorDetails,
		callTokenMap,
		downstreamModel,
		downstreamProvider,
		buildNoRoutableChannelsMeta,
		recordEarlyUsage,
		NO_ROUTABLE_CHANNELS_ERROR_CODE,
		responseAttemptCount,
	});
	if (failureResponse) {
		responseAttemptCount = attemptsExecuted;
		return failureResponse;
	}

	const responseToReturn = await finalizeSelectedResponse({
		c,
		selectedResponse,
		selectedChannel,
		isStream,
		selectedImmediateUsage,
		selectedParsedStreamUsage,
		selectedHasUsageHeaders,
		streamUsageMode,
		streamUsageOptions,
		streamUsageParseTimeoutMs,
		selectedRequestPath,
		markStreamMetaPartial,
		recordAttemptLog,
		selectedAttemptIndex,
		selectedAttemptStartedAt,
		selectedAttemptLatencyMs,
		selectedAttemptUpstreamRequestId,
		selectedUpstreamProvider,
		selectedUpstreamModel,
		downstreamModel,
		endpointType,
		STREAM_META_PARTIAL_CODE,
		USAGE_OBSERVE_FAILURE_STAGE,
		canResolveResponsesAffinity,
		downstreamProvider,
		tokenRecord,
		responsesAffinityTtlSeconds,
		selectedUpstreamEndpoint,
		traceId,
		selectedHasUsageSignal,
		selectedImmediateUsageSource,
		buildDirectErrorResponse,
		recordAttemptUsage,
		requestStart,
		downstreamSignal,
		recordSelectedClientDisconnect,
		recordSelectedStreamUsage,
		DOWNSTREAM_CLIENT_ABORT_ERROR_CODE,
		RESPONSE_ADAPT_FAILED_CODE,
		jsonErrorWithTrace,
		downstreamAbortResponse,
		attemptsExecuted,
		responseAttemptCount,
	});

	responseAttemptCount = attemptsExecuted;
	return withTraceHeader(responseToReturn);
});

export default proxy;
