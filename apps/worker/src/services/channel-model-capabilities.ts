import type { D1Database } from "@cloudflare/workers-types";
import { nowIso } from "../utils/time";
import type { ModelEntry } from "./channel-models";
import { extractModelIds } from "./channel-models";

export type CapabilityRow = {
	channel_id: string;
	model: string;
	last_ok_at: number | null;
	last_err_count?: number | null;
};

export function buildCapabilityMap(
	rows: CapabilityRow[],
): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const row of rows) {
		if (!row.channel_id || !row.model) {
			continue;
		}
		const lastOk = Number(row.last_ok_at ?? 0);
		if (!lastOk || lastOk <= 0) {
			continue;
		}
		const set = map.get(row.channel_id) ?? new Set<string>();
		set.add(row.model);
		map.set(row.channel_id, set);
	}
	return map;
}

export async function listVerifiedModelsByChannel(
	db: D1Database,
	channelIds: string[],
): Promise<Map<string, Set<string>>> {
	if (channelIds.length === 0) {
		return new Map();
	}
	const placeholders = channelIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(
			`SELECT channel_id, model, last_ok_at FROM channel_model_capabilities WHERE channel_id IN (${placeholders}) AND last_ok_at > 0`,
		)
		.bind(...channelIds)
		.all<CapabilityRow>();
	return buildCapabilityMap(rows.results ?? []);
}

export async function listVerifiedModelEntries(
	db: D1Database,
	channels: Array<{ id: string; name: string }>,
): Promise<ModelEntry[]> {
	const ids = channels.map((channel) => channel.id);
	const nameMap = new Map(
		channels.map((channel) => [channel.id, channel.name]),
	);
	const map = await listVerifiedModelsByChannel(db, ids);
	const entries: ModelEntry[] = [];
	for (const [channelId, models] of map.entries()) {
		const channelName = nameMap.get(channelId) ?? channelId;
		for (const id of models) {
			entries.push({ id, label: id, channelId, channelName });
		}
	}
	return entries;
}

export async function listModelsByChannelWithFallback(
	db: D1Database,
	channels: Array<{ id: string; name: string; models_json?: string | null }>,
): Promise<Map<string, Set<string>>> {
	const ids = channels.map((channel) => channel.id);
	const verified = await listVerifiedModelsByChannel(db, ids);
	const map = new Map<string, Set<string>>();
	for (const channel of channels) {
		const verifiedModels = verified.get(channel.id);
		if (verifiedModels && verifiedModels.size > 0) {
			map.set(channel.id, new Set(verifiedModels));
			continue;
		}
		const declaredModels = extractModelIds(channel);
		if (declaredModels.length > 0) {
			map.set(channel.id, new Set(declaredModels));
		}
	}
	return map;
}

export async function listModelEntriesWithFallback(
	db: D1Database,
	channels: Array<{ id: string; name: string; models_json?: string | null }>,
): Promise<ModelEntry[]> {
	const map = await listModelsByChannelWithFallback(db, channels);
	const entries: ModelEntry[] = [];
	for (const channel of channels) {
		const models = map.get(channel.id);
		if (!models) {
			continue;
		}
		for (const id of models) {
			entries.push({
				id,
				label: id,
				channelId: channel.id,
				channelName: channel.name,
			});
		}
	}
	return entries;
}

export async function listCoolingDownChannelsForModel(
	db: D1Database,
	channelIds: string[],
	model: string | null,
	cooldownSeconds: number,
	minErrorCount: number = 1,
): Promise<Set<string>> {
	if (!model || channelIds.length === 0 || cooldownSeconds <= 0) {
		return new Set();
	}
	const now = Math.floor(Date.now() / 1000);
	const cutoff = now - cooldownSeconds;
	const placeholders = channelIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(
			`SELECT channel_id, last_err_at, last_ok_at, last_err_count FROM channel_model_capabilities WHERE model = ? AND channel_id IN (${placeholders}) AND last_err_at IS NOT NULL AND last_err_at >= ?`,
		)
		.bind(model, ...channelIds, cutoff)
		.all<{
			channel_id: string;
			last_err_at: number | null;
			last_ok_at: number | null;
			last_err_count?: number | null;
		}>();
	const blocked = new Set<string>();
	for (const row of rows.results ?? []) {
		const lastErr = Number(row.last_err_at ?? 0);
		const lastOk = Number(row.last_ok_at ?? 0);
		const errCount = Number(row.last_err_count ?? 0);
		if (lastErr && lastErr >= lastOk && errCount >= minErrorCount) {
			blocked.add(row.channel_id);
		}
	}
	return blocked;
}

export async function recordChannelModelError(
	db: D1Database,
	channelId: string,
	model: string | null,
	errorCode: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
	if (!model) {
		return;
	}
	const timestamp = nowIso();
	await db
		.prepare(
			"INSERT INTO channel_model_capabilities (channel_id, model, last_ok_at, last_err_at, last_err_code, last_err_count, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 1, ?, ?) ON CONFLICT(channel_id, model) DO UPDATE SET last_err_at = excluded.last_err_at, last_err_code = excluded.last_err_code, last_err_count = COALESCE(channel_model_capabilities.last_err_count, 0) + 1, updated_at = excluded.updated_at",
		)
		.bind(channelId, model, nowSeconds, errorCode, timestamp, timestamp)
		.run();
}

export async function upsertChannelModelCapabilities(
	db: D1Database,
	channelId: string,
	models: string[],
	nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
	if (models.length === 0) {
		return;
	}
	const timestamp = nowIso();
	const stmt = db.prepare(
		"INSERT INTO channel_model_capabilities (channel_id, model, last_ok_at, last_err_at, last_err_code, last_err_count, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, ?, ?) ON CONFLICT(channel_id, model) DO UPDATE SET last_ok_at = excluded.last_ok_at, last_err_at = NULL, last_err_code = NULL, last_err_count = 0, updated_at = excluded.updated_at",
	);
	const statements = models.map((model) =>
		stmt.bind(channelId, model, nowSeconds, timestamp, timestamp),
	);
	await db.batch(statements);
}
