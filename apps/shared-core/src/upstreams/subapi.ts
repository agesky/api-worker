import type { UpstreamDescriptor } from "./types";

export const subApiUpstreamDescriptor: UpstreamDescriptor = {
	siteType: "subapi",
	label: "Sub API",
	defaultProvider: "openai",
	supportsCheckin: false,
	supportsSystemCredentials: true,
};
