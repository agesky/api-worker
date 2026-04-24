import { anthropicUpstreamDescriptor } from "./anthropic";
import { doneHubUpstreamDescriptor } from "./done-hub";
import { geminiUpstreamDescriptor } from "./gemini";
import { newApiUpstreamDescriptor } from "./new-api";
import { openAiUpstreamDescriptor } from "./openai";
import { subApiUpstreamDescriptor } from "./subapi";
import type { ProviderType, SiteType, UpstreamDescriptor } from "./types";

const descriptors: UpstreamDescriptor[] = [
	newApiUpstreamDescriptor,
	doneHubUpstreamDescriptor,
	subApiUpstreamDescriptor,
	openAiUpstreamDescriptor,
	anthropicUpstreamDescriptor,
	geminiUpstreamDescriptor,
];

export function isSiteType(value: unknown): value is SiteType {
	return (
		value === "new-api" ||
		value === "done-hub" ||
		value === "subapi" ||
		value === "openai" ||
		value === "anthropic" ||
		value === "gemini"
	);
}

export function normalizeSiteType(value: unknown): SiteType {
	if (isSiteType(value)) {
		return value;
	}
	if (value === "custom") {
		return "subapi";
	}
	return "new-api";
}

export function getUpstreamDescriptor(siteType: SiteType): UpstreamDescriptor {
	return (
		descriptors.find((descriptor) => descriptor.siteType === siteType) ??
		newApiUpstreamDescriptor
	);
}

export function getSiteTypeLabel(siteType: SiteType): string {
	return getUpstreamDescriptor(siteType).label;
}

export function getDefaultBaseUrlForSiteType(
	siteType: SiteType,
): string | undefined {
	return getUpstreamDescriptor(siteType).defaultBaseUrl;
}

export function supportsSiteCheckin(siteType: SiteType): boolean {
	return getUpstreamDescriptor(siteType).supportsCheckin;
}

export function supportsSystemCredentials(siteType: SiteType): boolean {
	return getUpstreamDescriptor(siteType).supportsSystemCredentials;
}

export function resolveDefaultProviderForSiteType(
	siteType: SiteType,
): ProviderType {
	return getUpstreamDescriptor(siteType).defaultProvider;
}

export {
	anthropicUpstreamDescriptor,
	doneHubUpstreamDescriptor,
	geminiUpstreamDescriptor,
	newApiUpstreamDescriptor,
	openAiUpstreamDescriptor,
	subApiUpstreamDescriptor,
};

export type { ProviderType, SiteType, UpstreamDescriptor };
