import { normalizeMessage, normalizeStringField } from "./shared";

const STREAM_OPTIONS_UNSUPPORTED_SNIPPET = "unsupported parameter";
const STREAM_OPTIONS_PARAM_NAME = "stream_options";

export function extractOpenAiResponseIdFromJson(
	payload: unknown,
): string | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	const record = payload as Record<string, unknown>;
	const objectType = normalizeStringField(record.object)?.toLowerCase();
	if (objectType && objectType !== "response") {
		return null;
	}
	return normalizeStringField(record.id);
}

export function isStreamOptionsUnsupportedMessage(
	message: string | null,
): boolean {
	const normalized = normalizeMessage(message)?.toLowerCase();
	if (!normalized) {
		return false;
	}
	return (
		normalized.includes(STREAM_OPTIONS_UNSUPPORTED_SNIPPET) &&
		normalized.includes(STREAM_OPTIONS_PARAM_NAME)
	);
}
