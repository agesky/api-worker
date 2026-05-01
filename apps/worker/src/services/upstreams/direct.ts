import {
	resolveDefaultProviderForSiteType,
	supportsSiteCheckin,
	type ProviderType,
	type SiteType,
} from "../../../../shared-core/src";
import { getProviderAdapter } from "../providers";
import type { UpstreamAdapter } from "./types";

const directProviderBySiteType: Partial<Record<SiteType, ProviderType>> = {
	openai: "openai",
	anthropic: "anthropic",
	gemini: "gemini",
};

export const directUpstreamAdapter: UpstreamAdapter = {
	kind: "openai",
	supportsSiteType(siteType) {
		return directProviderBySiteType[siteType] !== undefined;
	},
	resolveProvider(siteType, explicitProvider) {
		return (
			explicitProvider ??
			directProviderBySiteType[siteType] ??
			resolveDefaultProviderForSiteType(siteType)
		);
	},
	supportsCheckin(siteType) {
		return supportsSiteCheckin(siteType);
	},
	discoverModels(input) {
		const provider = this.resolveProvider(input.siteType, input.provider);
		return getProviderAdapter(provider).discoverModels(
			input.baseUrl,
			input.apiKey,
			input.fetcher,
		);
	},
};
