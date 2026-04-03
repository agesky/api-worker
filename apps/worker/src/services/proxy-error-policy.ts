export type ProxyErrorAction = "retry" | "sleep" | "disable" | "return";

export type ProxyErrorPolicySets = {
	sleepErrorCodeSet: Set<string>;
	disableErrorCodeSet: Set<string>;
	returnErrorCodeSet: Set<string>;
};

function normalizeMessage(value: string | null): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProxyErrorCode(value: string | null): string {
	return normalizeMessage(value)?.toLowerCase() ?? "";
}

export function buildProxyErrorCodeSet(codes: string[]): Set<string> {
	const normalized = codes
		.map((code) => normalizeProxyErrorCode(code))
		.filter((code) => code.length > 0);
	return new Set(normalized);
}

function isNoAvailableChannelMessage(message: string | null): boolean {
	const normalized = normalizeMessage(message)?.toLowerCase() ?? "";
	if (!normalized) {
		return false;
	}
	return (
		normalized.includes("no available channel") ||
		normalized.includes("无可用渠道") ||
		normalized.includes("no available providers") ||
		normalized.includes("无可用供应商")
	);
}

export function buildProxyErrorLookupKeys(
	errorCode: string | null,
	errorMessage: string | null,
): string[] {
	const normalizedCode = normalizeProxyErrorCode(errorCode);
	const lookupKeys: string[] = [];
	if (
		normalizedCode === "pond_hub_error" &&
		isNoAvailableChannelMessage(errorMessage)
	) {
		lookupKeys.push("model_not_found");
	}
	if (normalizedCode) {
		lookupKeys.push(normalizedCode);
	}
	return lookupKeys;
}

export function resolveProxyErrorAction(
	policy: ProxyErrorPolicySets,
	errorCode: string | null,
	errorMessage: string | null,
): ProxyErrorAction {
	const lookupKeys = buildProxyErrorLookupKeys(errorCode, errorMessage);
	for (const key of lookupKeys) {
		if (policy.returnErrorCodeSet.has(key)) {
			return "return";
		}
	}
	for (const key of lookupKeys) {
		if (policy.disableErrorCodeSet.has(key)) {
			return "disable";
		}
	}
	for (const key of lookupKeys) {
		if (policy.sleepErrorCodeSet.has(key)) {
			return "sleep";
		}
	}
	return "retry";
}
