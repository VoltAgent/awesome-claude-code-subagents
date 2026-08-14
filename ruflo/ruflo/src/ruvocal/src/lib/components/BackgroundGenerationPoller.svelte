<script lang="ts">
	import { browser, dev } from "$app/environment";
	import { invalidate } from "$app/navigation";

	import {
		type BackgroundGeneration,
		backgroundGenerationEntries,
		removeBackgroundGeneration,
	} from "$lib/stores/backgroundGenerations";
	import { handleResponse, useAPIClient } from "$lib/APIClient";
	import { UrlDependency } from "$lib/types/UrlDependency";
	import type { Message } from "$lib/types/Message";
	import { isAssistantGenerationTerminal } from "$lib/utils/generationState";

	const POLL_INTERVAL_MS = 1000;
	const MAX_POLL_DURATION_MS = 3 * 60_000;

	const client = useAPIClient();
	const pollers = new Map<string, () => void>();
	const inflight = new Set<string>();
	const assistantSnapshots = new Map<string, string>();
	const failureCounts = new Map<string, number>();

	$effect.root(() => {
		if (!browser) {
			pollers.clear();
			return;
		}

		let destroyed = false;

		const log = (...args: unknown[]) => {
			if (dev) {
				console.log("background generation", ...args);
			}
		};

		const stopPoller = (id: string, reason?: string) => {
			const stop = pollers.get(id);
			if (!stop) return;

			stop();
			pollers.delete(id);
			inflight.delete(id);
			assistantSnapshots.delete(id);
			failureCounts.delete(id);
			log("stop", id, reason);
		};

		const pollOnce = async (id: string) => {
			if (destroyed || inflight.has(id)) return;

			const entry = backgroundGenerationEntries.find((candidate) => candidate.id === id);
			if (entry && Date.now() - entry.startedAt > MAX_POLL_DURATION_MS) {
				removeBackgroundGeneration(id);
				stopPoller(id, "timed out");
				log("timeout", id);
				await invalidate(UrlDependency.ConversationList);
				await invalidate(UrlDependency.Conversation);
				return;
			}

			inflight.add(id);
			log("poll", id);

			try {
				const response = await client.conversations({ id }).get({ query: {} });
				const conversation = handleResponse(response) as {
					messages?: Message[];
				} | null;
				const messages: Message[] = conversation?.messages ?? [];
				const lastAssistant = [...messages]
					.reverse()
					.find((message: Message) => message.from === "assistant");

				const isTerminal = isAssistantGenerationTerminal(lastAssistant);

				const snapshot = lastAssistant
					? JSON.stringify({
							id: lastAssistant.id,
							updatedAt: lastAssistant.updatedAt,
							contentLength: lastAssistant.content?.length ?? 0,
							updatesLength: lastAssistant.updates?.length ?? 0,
						})
					: "__none__";
				const previousSnapshot = assistantSnapshots.get(id);
				let shouldInvalidateConversation = false;

				if (lastAssistant) {
					assistantSnapshots.set(id, snapshot);
					if (snapshot !== previousSnapshot) {
						shouldInvalidateConversation = true;
					}
				} else if (assistantSnapshots.has(id)) {
					assistantSnapshots.delete(id);
					shouldInvalidateConversation = true;
				}

				if (lastAssistant && isTerminal) {
					removeBackgroundGeneration(id);
					assistantSnapshots.delete(id);
					failureCounts.delete(id);
					shouldInvalidateConversation = true;
					log("complete", id, "terminal");
					await invalidate(UrlDependency.ConversationList);
				}

				if (shouldInvalidateConversation) {
					await invalidate(UrlDependency.Conversation);
				}

				failureCounts.delete(id);
			} catch (err) {
				console.error("Background generation poll failed", id, err);
				const failures = (failureCounts.get(id) ?? 0) + 1;
				failureCounts.set(id, failures);
				if (failures >= 3) {
					removeBackgroundGeneration(id);
					assistantSnapshots.delete(id);
					failureCounts.delete(id);
					log("failures", id, failures);
					await invalidate(UrlDependency.ConversationList);
				}
			} finally {
				inflight.delete(id);
			}
		};

		const startPoller = (entry: BackgroundGeneration) => {
			if (pollers.has(entry.id)) return;

			const intervalId = setInterval(() => {
				void pollOnce(entry.id);
			}, POLL_INTERVAL_MS);

			pollers.set(entry.id, () => clearInterval(intervalId));
			void pollOnce(entry.id);
			log("start", entry.id);
		};

		$effect(() => {
			const entries = backgroundGenerationEntries;

			if (destroyed) return;

			const activeIds = new Set(entries.map((entry) => entry.id));

			for (const id of pollers.keys()) {
				if (!activeIds.has(id)) {
					stopPoller(id);
				}
			}

			for (const entry of entries) {
				startPoller(entry);
			}
		});

		return () => {
			destroyed = true;
			for (const stop of pollers.values()) stop();
			pollers.clear();
			inflight.clear();
			assistantSnapshots.clear();
			failureCounts.clear();
		};
	});
</script>
