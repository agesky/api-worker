import {
	applyHeaderOverrides,
	buildBaseHeaders,
	buildModelsEndpoint,
	ensureJsonContentType,
	performModelDiscovery,
	resolveEndpointOverride,
	toTextContent,
} from "./common";
import type { ProviderAdapter } from "./types";

function normalizeGeminiMethod(value: unknown): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function pickGeminiModelId(item: unknown): string | null {
	if (!item || typeof item !== "object" || Array.isArray(item)) {
		return null;
	}
	const record = item as {
		name?: unknown;
		baseModelId?: unknown;
		supportedGenerationMethods?: unknown;
	};
	const methods = Array.isArray(record.supportedGenerationMethods)
		? record.supportedGenerationMethods
				.map(normalizeGeminiMethod)
				.filter(Boolean)
		: [];
	if (methods.length > 0 && !methods.includes("generatecontent")) {
		return null;
	}
	const baseModelId = String(record.baseModelId ?? "").trim();
	if (baseModelId) {
		return baseModelId;
	}
	const name = String(record.name ?? "").trim();
	if (!name) {
		return null;
	}
	return name.replace(/^models\//u, "");
}

export const geminiProviderAdapter: ProviderAdapter = {
	provider: "gemini",
	supportsModelDiscovery() {
		return true;
	},
	discoverModels(baseUrl, apiKey, fetcher) {
		const headers = ensureJsonContentType(new Headers());
		headers.set("x-goog-api-key", apiKey);
		return performModelDiscovery({
			target: buildModelsEndpoint(baseUrl, "/v1beta/models"),
			headers,
			parseModels(payload) {
				if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
					return [];
				}
				const models = Array.isArray((payload as { models?: unknown[] }).models)
					? (payload as { models: unknown[] }).models
					: [];
				const seenModels = new Set<string>();
				const modelIds: string[] = [];
				for (const item of models) {
					const modelId = pickGeminiModelId(item);
					if (!modelId || seenModels.has(modelId)) {
						continue;
					}
					seenModels.add(modelId);
					modelIds.push(modelId);
				}
				return modelIds;
			},
			fetcher,
		});
	},
	buildAuthHeaders(baseHeaders, apiKey, overrides) {
		const headers = buildBaseHeaders(baseHeaders);
		headers.delete("Authorization");
		headers.set("x-goog-api-key", apiKey);
		return applyHeaderOverrides(headers, overrides);
	},
	applyModelToPath(path, model) {
		if (!model) {
			return path;
		}
		const withPlaceholder = path.replace(/\{model\}/gu, model);
		if (withPlaceholder !== path) {
			return withPlaceholder;
		}
		return withPlaceholder.replace(
			/\/models\/[^/:?]+(?=[:/?]|$)/u,
			`/models/${model}`,
		);
	},
	normalizeEmbeddingRequest(body, model) {
		if (!body) {
			return null;
		}
		if (Array.isArray(body.requests)) {
			const inputs = body.requests
				.map((req) => {
					if (!req || typeof req !== "object") {
						return "";
					}
					const record = req as Record<string, unknown>;
					return toTextContent(record.content);
				})
				.filter((item) => item.length > 0);
			return { model, inputs };
		}
		const content = body.content ?? body.input;
		return { model, inputs: [toTextContent(content)] };
	},
	normalizeImageRequest(body, model) {
		if (!body) {
			return null;
		}
		return {
			model,
			prompt: toTextContent(body.prompt ?? body.text ?? body.input),
			n: null,
			size: null,
			quality: null,
			style: null,
			responseFormat: null,
		};
	},
	buildEmbeddingRequest(normalized, model, endpointOverrides) {
		const override = resolveEndpointOverride(
			endpointOverrides.embedding_url,
			model,
		);
		const isBatch = normalized.inputs.length > 1;
		const defaultPath = isBatch
			? `/v1beta/models/${model}:batchEmbedContents`
			: `/v1beta/models/${model}:embedContent`;
		const body = isBatch
			? {
					requests: normalized.inputs.map((input) => ({
						content: { parts: [{ text: input }] },
					})),
				}
			: {
					content: { parts: [{ text: normalized.inputs[0] ?? "" }] },
				};
		return {
			path: override?.path ?? defaultPath,
			absoluteUrl: override?.absolute,
			body,
		};
	},
	buildImageRequest(normalized, model, endpointOverrides) {
		const override = resolveEndpointOverride(
			endpointOverrides.image_url,
			model,
		);
		return {
			path: override?.path ?? `/v1beta/models/${model}:generateImage`,
			absoluteUrl: override?.absolute,
			body: {
				prompt: normalized.prompt,
			},
		};
	},
};
