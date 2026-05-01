import type { UpstreamDescriptor } from "./types";

export const newApiUpstreamDescriptor: UpstreamDescriptor = {
	siteType: "new-api",
	label: "New API",
	defaultProvider: "openai",
	supportsCheckin: true,
	supportsSystemCredentials: true,
};
