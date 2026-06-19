import type { ProviderType } from "../provider-transform";
import { anthropicProviderAdapter } from "./anthropic";
import { geminiProviderAdapter } from "./gemini";
import { openAiProviderAdapter } from "./openai";
import type { ProviderAdapter } from "./types";

const providerAdapters: Record<ProviderType, ProviderAdapter> = {
	openai: openAiProviderAdapter,
	anthropic: anthropicProviderAdapter,
	gemini: geminiProviderAdapter,
};

export function getProviderAdapter(
	provider: ProviderType = "openai",
): ProviderAdapter {
	return providerAdapters[provider] ?? openAiProviderAdapter;
}

export type { ModelDiscoveryResult, ProviderAdapter } from "./types";
