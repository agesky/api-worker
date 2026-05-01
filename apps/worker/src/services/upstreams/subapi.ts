import {
	resolveDefaultProviderForSiteType,
	supportsSiteCheckin,
} from "../../../../shared-core/src";
import { getProviderAdapter } from "../providers";
import type { UpstreamAdapter } from "./types";

export const subApiUpstreamAdapter: UpstreamAdapter = {
	kind: "subapi",
	supportsSiteType(siteType) {
		return siteType === "subapi";
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
