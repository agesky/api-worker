import type { ModelDiscoveryResult } from "../providers";
import type { ProviderType, SiteType } from "../../../../shared-core/src";

export type UpstreamKind =
	| "new-api"
	| "done-hub"
	| "subapi"
	| "openai"
	| "anthropic"
	| "gemini";

export type UpstreamDiscoveryInput = {
	siteType: SiteType;
	baseUrl: string;
	apiKey: string;
	provider?: ProviderType;
	fetcher?: typeof fetch;
};

export type UpstreamAdapter = {
	readonly kind: UpstreamKind;
	supportsSiteType(siteType: SiteType): boolean;
	resolveProvider(
		siteType: SiteType,
		explicitProvider?: ProviderType,
	): ProviderType;
	supportsCheckin(siteType: SiteType): boolean;
	discoverModels(input: UpstreamDiscoveryInput): Promise<ModelDiscoveryResult>;
};
