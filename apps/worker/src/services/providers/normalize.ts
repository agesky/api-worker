import type {
	NormalizedEmbeddingRequest,
	NormalizedImageRequest,
	ProviderType,
} from "../provider-transform";
import { getProviderAdapter } from ".";

export function normalizeProviderEmbeddingRequest(
	provider: ProviderType,
	body: Record<string, unknown> | null,
	model: string | null,
): NormalizedEmbeddingRequest | null {
	return getProviderAdapter(provider).normalizeEmbeddingRequest(body, model);
}

export function normalizeProviderImageRequest(
	provider: ProviderType,
	body: Record<string, unknown> | null,
	model: string | null,
): NormalizedImageRequest | null {
	return getProviderAdapter(provider).normalizeImageRequest(body, model);
}
