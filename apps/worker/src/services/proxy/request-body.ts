export type ResponsesRequestHints = {
	previousResponseId: string | null;
	functionCallOutputIds: string[];
	hasFunctionCallOutput: boolean;
};

export function extractModelFromRawJsonRequest(rawText: string): string | null {
	if (!rawText) {
		return null;
	}
	const match = rawText.match(/"model"\s*:\s*"((?:\\.|[^"\\])*)"/);
	if (!match?.[1]) {
		return null;
	}
	return decodeRawJsonStringLiteral(match[1]);
}

function decodeRawJsonStringLiteral(value: string): string | null {
	try {
		return JSON.parse(`"${value}"`);
	} catch {
		return null;
	}
}

function extractStringFieldFromRawJsonRequest(
	rawText: string,
	fieldName: string,
): string | null {
	const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const matcher = new RegExp(
		`"${escapedName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
	);
	const match = rawText.match(matcher);
	if (!match?.[1]) {
		return null;
	}
	return decodeRawJsonStringLiteral(match[1]);
}

export function extractResponsesRequestHintsFromRawJsonRequest(
	rawText: string,
): ResponsesRequestHints | null {
	if (!rawText) {
		return null;
	}
	const previousResponseId =
		extractStringFieldFromRawJsonRequest(rawText, "previous_response_id") ??
		extractStringFieldFromRawJsonRequest(rawText, "previousResponseId");
	const hasFunctionCallOutput = /"type"\s*:\s*"function_call_output"/.test(
		rawText,
	);
	if (!previousResponseId && !hasFunctionCallOutput) {
		return null;
	}
	return {
		previousResponseId,
		functionCallOutputIds: [],
		hasFunctionCallOutput,
	};
}

export function rewriteModelInRawJsonRequest(
	rawText: string | undefined,
	model: string,
): string | undefined {
	if (!rawText) {
		return rawText;
	}
	const matcher = /"model"\s*:\s*"(?:\\.|[^"\\])*"/;
	if (!matcher.test(rawText)) {
		return rawText;
	}
	return rawText.replace(matcher, `"model":${JSON.stringify(model)}`);
}
