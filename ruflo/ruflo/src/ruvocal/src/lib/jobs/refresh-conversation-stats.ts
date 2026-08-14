import type { ConversationStats } from "$lib/types/ConversationStats";
import { CONVERSATION_STATS_COLLECTION, collections } from "$lib/server/database";
import { logger } from "$lib/server/logger";
import type { ObjectId } from "mongodb";
import { acquireLock, refreshLock } from "$lib/migrations/lock";
import { Semaphores } from "$lib/types/Semaphore";

async function getLastComputationTime(): Promise<Date> {
	const lastStats = await collections.conversationStats.findOne({}, { sort: { "date.at": -1 } });
	return lastStats?.date?.at || new Date(0);
}

async function shouldComputeStats(): Promise<boolean> {
	const lastComputationTime = await getLastComputationTime();
	const oneDayAgo = new Date(Date.now() - 24 * 3_600_000);
	return lastComputationTime < oneDayAgo;
}

export async function computeAllStats() {
	for (const span of ["day", "week", "month"] as const) {
		computeStats({ dateField: "updatedAt", type: "conversation", span }).catch((e) =>
			logger.error(e, "Error computing conversation stats for updatedAt")
		);
		computeStats({ dateField: "createdAt", type: "conversation", span }).catch((e) =>
			logger.error(e, "Error computing conversation stats for createdAt")
		);
		computeStats({ dateField: "createdAt", type: "message", span }).catch((e) =>
			logger.error(e, "Error computing message stats for createdAt")
		);
	}
}

async function computeStats(params: {
	dateField: ConversationStats["date"]["field"];
	span: ConversationStats["date"]["span"];
	type: ConversationStats["type"];
}) {
	const indexes = await collections.semaphores.listIndexes().toArray();
	if (indexes.length <= 2) {
		logger.info("Indexes not created, skipping stats computation");
		return;
	}

	const lastComputed = await collections.conversationStats.findOne(
		{ "date.field": params.dateField, "date.span": params.span, type: params.type },
		{ sort: { "date.at": -1 } }
	);

	// If the last computed week is at the beginning of the last computed month, we need to include some days from the previous month
	// In those cases we need to compute the stats from before the last month as everything is one aggregation
	const minDate = lastComputed ? lastComputed.date.at : new Date(0);

	logger.debug(
		{ minDate, dateField: params.dateField, span: params.span, type: params.type },
		"Computing conversation stats"
	);

	const dateField = params.type === "message" ? "messages." + params.dateField : params.dateField;

	const pipeline = [
		{
			$match: {
				[dateField]: { $gte: minDate },
			},
		},
		// For message stats: use $filter to reduce data before $unwind (optimization)
		// For conversation stats: simple projection
		...(params.type === "message"
			? [
					{
						$project: {
							// Filter messages by date, then map to only keep the date field
							// This avoids carrying large message payloads (content, files, etc.) through the pipeline
							messages: {
								$map: {
									input: {
										$filter: {
											input: "$messages",
											as: "msg",
											cond: { $gte: [`$$msg.${params.dateField}`, minDate] },
										},
									},
									as: "msg",
									in: { [params.dateField]: `$$msg.${params.dateField}` },
								},
							},
							sessionId: 1,
							userId: 1,
						},
					},
					{
						$unwind: "$messages",
					},
				]
			: [
					{
						$project: {
							[dateField]: 1,
							sessionId: 1,
							userId: 1,
						},
					},
				]),
		{
			$sort: {
				[dateField]: 1,
			},
		},
		{
			$facet: {
				userId: [
					{
						$match: {
							userId: { $exists: true },
						},
					},
					{
						$group: {
							_id: {
								at: { $dateTrunc: { date: `$${dateField}`, unit: params.span } },
								userId: "$userId",
							},
						},
					},
					{
						$group: {
							_id: "$_id.at",
							count: { $sum: 1 },
						},
					},
					{
						$project: {
							_id: 0,
							date: {
								at: "$_id",
								field: params.dateField,
								span: params.span,
							},
							distinct: "userId",
							count: 1,
						},
					},
				],
				sessionId: [
					{
						$match: {
							sessionId: { $exists: true },
						},
					},
					{
						$group: {
							_id: {
								at: { $dateTrunc: { date: `$${dateField}`, unit: params.span } },
								sessionId: "$sessionId",
							},
						},
					},
					{
						$group: {
							_id: "$_id.at",
							count: { $sum: 1 },
						},
					},
					{
						$project: {
							_id: 0,
							date: {
								at: "$_id",
								field: params.dateField,
								span: params.span,
							},
							distinct: "sessionId",
							count: 1,
						},
					},
				],
				userOrSessionId: [
					{
						$group: {
							_id: {
								at: { $dateTrunc: { date: `$${dateField}`, unit: params.span } },
								userOrSessionId: { $ifNull: ["$userId", "$sessionId"] },
							},
						},
					},
					{
						$group: {
							_id: "$_id.at",
							count: { $sum: 1 },
						},
					},
					{
						$project: {
							_id: 0,
							date: {
								at: "$_id",
								field: params.dateField,
								span: params.span,
							},
							distinct: "userOrSessionId",
							count: 1,
						},
					},
				],
				_id: [
					{
						$group: {
							_id: { $dateTrunc: { date: `$${dateField}`, unit: params.span } },
							count: { $sum: 1 },
						},
					},
					{
						$project: {
							_id: 0,
							date: {
								at: "$_id",
								field: params.dateField,
								span: params.span,
							},
							distinct: "_id",
							count: 1,
						},
					},
				],
			},
		},
		{
			$project: {
				stats: {
					$concatArrays: ["$userId", "$sessionId", "$userOrSessionId", "$_id"],
				},
			},
		},
		{
			$unwind: "$stats",
		},
		{
			$replaceRoot: {
				newRoot: "$stats",
			},
		},
		{
			$set: {
				type: params.type,
			},
		},
		{
			$merge: {
				into: CONVERSATION_STATS_COLLECTION,
				on: ["date.at", "type", "date.span", "date.field", "distinct"],
				whenMatched: "replace",
				whenNotMatched: "insert",
			},
		},
	];

	await collections.conversations.aggregate(pipeline, { allowDiskUse: true }).next();

	logger.debug(
		{ minDate, dateField: params.dateField, span: params.span, type: params.type },
		"Computed conversation stats"
	);
}

let hasLock = false;
let lockId: ObjectId | null = null;

async function maintainLock() {
	if (hasLock && lockId) {
		hasLock = await refreshLock(Semaphores.CONVERSATION_STATS, lockId);

		if (!hasLock) {
			lockId = null;
		}
	} else if (!hasLock) {
		lockId = (await acquireLock(Semaphores.CONVERSATION_STATS)) || null;
		hasLock = !!lockId;
	}

	setTimeout(maintainLock, 10_000);
}

export function refreshConversationStats() {
	const ONE_HOUR_MS = 3_600_000;

	maintainLock().then(async () => {
		if (await shouldComputeStats()) {
			computeAllStats();
		}

		setInterval(async () => {
			if (await shouldComputeStats()) {
				computeAllStats();
			}
		}, 24 * ONE_HOUR_MS);
	});
}
