import type { UpstreamDescriptor } from "./types";

export const doneHubUpstreamDescriptor: UpstreamDescriptor = {
	siteType: "done-hub",
	label: "Done Hub",
	defaultProvider: "openai",
	supportsCheckin: false,
	supportsSystemCredentials: true,
};
