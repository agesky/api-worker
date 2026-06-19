import {
	resolveDefaultProviderForSiteType,
	supportsSiteCheckin,
} from "../../../../shared-core/src";
import { getProviderAdapter } from "../providers";
import type { UpstreamAdapter } from "./types";

export const newApiUpstreamAdapter: UpstreamAdapter = {
	kind: "new-api",
	supportsSiteType(siteType) {
		return siteType === "new-api";
	},
	resolveProvider(siteType, explicitProvider) {
		return explicitProvider ?? resolveDefaultProviderForSiteType(siteType);
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
