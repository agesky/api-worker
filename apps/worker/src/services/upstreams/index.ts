import type { ProviderType, SiteType } from "../../../../shared-core/src";
import { doneHubUpstreamAdapter } from "./done-hub";
import { directUpstreamAdapter } from "./direct";
import { newApiUpstreamAdapter } from "./new-api";
import { subApiUpstreamAdapter } from "./subapi";
import type {
	UpstreamAdapter,
	UpstreamDiscoveryInput,
	UpstreamKind,
} from "./types";

const upstreamAdapters: UpstreamAdapter[] = [
	newApiUpstreamAdapter,
	doneHubUpstreamAdapter,
	subApiUpstreamAdapter,
	directUpstreamAdapter,
];

export function getUpstreamAdapter(siteType: SiteType): UpstreamAdapter {
	return (
		upstreamAdapters.find((adapter) => adapter.supportsSiteType(siteType)) ??
		newApiUpstreamAdapter
	);
}

export function parseProviderType(value: unknown): ProviderType | undefined {
	return value === "openai" || value === "anthropic" || value === "gemini"
		? value
		: undefined;
}

export function resolveUpstreamProvider(
	siteType: SiteType,
	explicitProvider?: ProviderType,
): ProviderType {
	return getUpstreamAdapter(siteType).resolveProvider(
		siteType,
		explicitProvider,
	);
}

export function discoverUpstreamModels(input: UpstreamDiscoveryInput) {
	return getUpstreamAdapter(input.siteType).discoverModels(input);
}

export function upstreamSupportsCheckin(siteType: SiteType): boolean {
	return getUpstreamAdapter(siteType).supportsCheckin(siteType);
}

export type { UpstreamAdapter, UpstreamDiscoveryInput, UpstreamKind };
