import type {
	DurableObjectNamespace,
	DurableObjectState,
	DurableObjectStub,
} from "@cloudflare/workers-types";
import { beijingDateString } from "../utils/time";

const LIMITER_NAME = "usage-limiter";
const DATE_KEY = "usage_date";
const RESERVED_COUNT_KEY = "usage_count";
const ENQUEUE_SUCCESS_COUNT_KEY = "usage_enqueue_success_count";
const DIRECT_COUNT_KEY = "usage_direct_count";
const FALLBACK_DIRECT_COUNT_KEY = "usage_fallback_direct_count";
const RESERVE_FAILED_COUNT_KEY = "usage_reserve_failed_count";
const RESERVE_OVER_LIMIT_COUNT_KEY = "usage_reserve_over_limit_count";
const QUEUE_SEND_FAILED_COUNT_KEY = "usage_queue_send_failed_count";

export type UsageQueueTrackKind =
	| "enqueue_success"
	| "direct"
	| "fallback_direct"
	| "reserve_failed"
	| "reserve_over_limit"
	| "queue_send_failed";

type UsageLimiterCounters = {
	reservedCount: number;
	enqueueSuccessCount: number;
	directCount: number;
	fallbackDirectCount: number;
	reserveFailedCount: number;
	reserveOverLimitCount: number;
	queueSendFailedCount: number;
};

export type UsageLimiterReserveResult = {
	ok: boolean;
	allowed: boolean;
	count: number;
	reserved_count: number;
	limit: number;
	date: string;
};

export type UsageLimiterStatus = {
	ok: boolean;
	date: string;
	count: number;
	reserved_count: number;
	enqueue_success_count: number;
	direct_count: number;
	fallback_direct_count: number;
	reserve_failed_count: number;
	reserve_over_limit_count: number;
	queue_send_failed_count: number;
};

export const getUsageLimiterStub = (namespace: DurableObjectNamespace) =>
	namespace.get(namespace.idFromName(LIMITER_NAME));

export async function reserveUsageQueue(
	stub: DurableObjectStub,
	options: { limit: number; amount?: number },
): Promise<UsageLimiterReserveResult> {
	const limit = Math.max(0, Math.floor(options.limit));
	const amount = Math.max(1, Math.floor(options.amount ?? 1));
	const response = await stub.fetch("https://usage-limiter/reserve", {
		method: "POST",
		body: JSON.stringify({ limit, amount }),
	});
	if (!response.ok) {
		throw new Error(`usage_limiter_failed:${response.status}`);
	}
	const payload = (await response.json()) as UsageLimiterReserveResult;
	return payload;
}

export async function getUsageQueueStatus(
	stub: DurableObjectStub,
): Promise<UsageLimiterStatus> {
	const response = await stub.fetch("https://usage-limiter/status");
	if (!response.ok) {
		throw new Error(`usage_limiter_status_failed:${response.status}`);
	}
	const payload = (await response.json()) as UsageLimiterStatus;
	return payload;
}

export async function trackUsageQueue(
	stub: DurableObjectStub,
	options: { kind: UsageQueueTrackKind },
): Promise<UsageLimiterStatus> {
	const response = await stub.fetch("https://usage-limiter/track", {
		method: "POST",
		body: JSON.stringify(options),
	});
	if (!response.ok) {
		throw new Error(`usage_limiter_track_failed:${response.status}`);
	}
	const payload = (await response.json()) as UsageLimiterStatus;
	return payload;
}

export class UsageLimiter {
	private state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	private async loadDailyCounters(nowDate: string): Promise<{
		date: string;
		counters: UsageLimiterCounters;
		dateChanged: boolean;
	}> {
		let storedDate = (await this.state.storage.get<string>(DATE_KEY)) ?? null;
		const counters: UsageLimiterCounters = {
			reservedCount:
				(await this.state.storage.get<number>(RESERVED_COUNT_KEY)) ?? 0,
			enqueueSuccessCount:
				(await this.state.storage.get<number>(ENQUEUE_SUCCESS_COUNT_KEY)) ?? 0,
			directCount:
				(await this.state.storage.get<number>(DIRECT_COUNT_KEY)) ?? 0,
			fallbackDirectCount:
				(await this.state.storage.get<number>(FALLBACK_DIRECT_COUNT_KEY)) ?? 0,
			reserveFailedCount:
				(await this.state.storage.get<number>(RESERVE_FAILED_COUNT_KEY)) ?? 0,
			reserveOverLimitCount:
				(await this.state.storage.get<number>(RESERVE_OVER_LIMIT_COUNT_KEY)) ??
				0,
			queueSendFailedCount:
				(await this.state.storage.get<number>(QUEUE_SEND_FAILED_COUNT_KEY)) ??
				0,
		};
		if (storedDate !== nowDate) {
			storedDate = nowDate;
			counters.reservedCount = 0;
			counters.enqueueSuccessCount = 0;
			counters.directCount = 0;
			counters.fallbackDirectCount = 0;
			counters.reserveFailedCount = 0;
			counters.reserveOverLimitCount = 0;
			counters.queueSendFailedCount = 0;
			return {
				date: storedDate,
				counters,
				dateChanged: true,
			};
		}
		return {
			date: storedDate,
			counters,
			dateChanged: false,
		};
	}

	private async persistDailyCounters(
		date: string,
		counters: UsageLimiterCounters,
	): Promise<void> {
		await this.state.storage.put({
			[DATE_KEY]: date,
			[RESERVED_COUNT_KEY]: counters.reservedCount,
			[ENQUEUE_SUCCESS_COUNT_KEY]: counters.enqueueSuccessCount,
			[DIRECT_COUNT_KEY]: counters.directCount,
			[FALLBACK_DIRECT_COUNT_KEY]: counters.fallbackDirectCount,
			[RESERVE_FAILED_COUNT_KEY]: counters.reserveFailedCount,
			[RESERVE_OVER_LIMIT_COUNT_KEY]: counters.reserveOverLimitCount,
			[QUEUE_SEND_FAILED_COUNT_KEY]: counters.queueSendFailedCount,
		});
	}

	private buildStatusPayload(
		date: string,
		counters: UsageLimiterCounters,
	): UsageLimiterStatus {
		return {
			ok: true,
			date,
			count: counters.reservedCount,
			reserved_count: counters.reservedCount,
			enqueue_success_count: counters.enqueueSuccessCount,
			direct_count: counters.directCount,
			fallback_direct_count: counters.fallbackDirectCount,
			reserve_failed_count: counters.reserveFailedCount,
			reserve_over_limit_count: counters.reserveOverLimitCount,
			queue_send_failed_count: counters.queueSendFailedCount,
		};
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/reserve") {
			let limit = 0;
			let amount = 1;
			try {
				const payload = (await request.json()) as {
					limit?: number;
					amount?: number;
				};
				limit = Math.max(0, Math.floor(Number(payload?.limit ?? 0)));
				amount = Math.max(1, Math.floor(Number(payload?.amount ?? 1)));
			} catch {
				return new Response("Invalid payload", { status: 400 });
			}
			const nowDate = beijingDateString(new Date());
			const daily = await this.loadDailyCounters(nowDate);
			const nextCount = daily.counters.reservedCount + amount;
			const allowed = limit <= 0 ? true : nextCount <= limit;
			if (allowed) {
				daily.counters.reservedCount = nextCount;
			}
			await this.persistDailyCounters(daily.date, daily.counters);
			return new Response(
				JSON.stringify({
					ok: true,
					allowed,
					count: daily.counters.reservedCount,
					reserved_count: daily.counters.reservedCount,
					limit,
					date: daily.date,
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}
		if (request.method === "POST" && url.pathname === "/track") {
			let kind = "";
			try {
				const payload = (await request.json()) as { kind?: string };
				kind = String(payload?.kind ?? "").trim();
			} catch {
				return new Response("Invalid payload", { status: 400 });
			}
			const allowedKinds = new Set<UsageQueueTrackKind>([
				"enqueue_success",
				"direct",
				"fallback_direct",
				"reserve_failed",
				"reserve_over_limit",
				"queue_send_failed",
			]);
			if (!allowedKinds.has(kind as UsageQueueTrackKind)) {
				return new Response("Invalid kind", { status: 400 });
			}
			const nowDate = beijingDateString(new Date());
			const daily = await this.loadDailyCounters(nowDate);
			switch (kind as UsageQueueTrackKind) {
				case "enqueue_success":
					daily.counters.enqueueSuccessCount += 1;
					break;
				case "direct":
					daily.counters.directCount += 1;
					break;
				case "fallback_direct":
					daily.counters.fallbackDirectCount += 1;
					daily.counters.directCount += 1;
					break;
				case "reserve_failed":
					daily.counters.reserveFailedCount += 1;
					daily.counters.directCount += 1;
					break;
				case "reserve_over_limit":
					daily.counters.reserveOverLimitCount += 1;
					daily.counters.directCount += 1;
					break;
				case "queue_send_failed":
					daily.counters.queueSendFailedCount += 1;
					break;
				default:
					return new Response("Invalid kind", { status: 400 });
			}
			await this.persistDailyCounters(daily.date, daily.counters);
			return new Response(
				JSON.stringify(this.buildStatusPayload(daily.date, daily.counters)),
				{ headers: { "Content-Type": "application/json" } },
			);
		}
		if (request.method === "GET" && url.pathname === "/status") {
			const nowDate = beijingDateString(new Date());
			const daily = await this.loadDailyCounters(nowDate);
			if (daily.dateChanged) {
				await this.persistDailyCounters(daily.date, daily.counters);
			}
			return new Response(
				JSON.stringify(this.buildStatusPayload(daily.date, daily.counters)),
				{ headers: { "Content-Type": "application/json" } },
			);
		}
		return new Response("Not Found", { status: 404 });
	}
}
