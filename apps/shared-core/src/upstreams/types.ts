export type SiteType =
	| "new-api"
	| "done-hub"
	| "subapi"
	| "openai"
	| "anthropic"
	| "gemini";

export type ProviderType = "openai" | "anthropic" | "gemini";

export type UpstreamDescriptor = {
	siteType: SiteType;
	label: string;
	defaultProvider: ProviderType;
	defaultBaseUrl?: string;
	supportsCheckin: boolean;
	supportsSystemCredentials: boolean;
};
