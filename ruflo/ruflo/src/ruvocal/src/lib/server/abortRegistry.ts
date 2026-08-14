import { logger } from "$lib/server/logger";

/**
 * Tracks active upstream generation requests so they can be cancelled on demand.
 * Multiple controllers can be registered per conversation (for threaded/background runs).
 */
export class AbortRegistry {
	private static instance: AbortRegistry;

	private controllers = new Map<string, Set<AbortController>>();

	public static getInstance(): AbortRegistry {
		if (!AbortRegistry.instance) {
			AbortRegistry.instance = new AbortRegistry();
		}
		return AbortRegistry.instance;
	}

	public register(conversationId: string, controller: AbortController) {
		const key = conversationId.toString();
		let set = this.controllers.get(key);
		if (!set) {
			set = new Set();
			this.controllers.set(key, set);
		}
		set.add(controller);
		controller.signal.addEventListener(
			"abort",
			() => {
				this.unregister(key, controller);
			},
			{ once: true }
		);
	}

	public abort(conversationId: string) {
		const set = this.controllers.get(conversationId);
		if (!set?.size) return;

		logger.debug({ conversationId }, "Aborting active generation via AbortRegistry");
		for (const controller of set) {
			if (!controller.signal.aborted) {
				controller.abort();
			}
		}
		this.controllers.delete(conversationId);
	}

	public unregister(conversationId: string, controller: AbortController) {
		const set = this.controllers.get(conversationId);
		if (!set) return;
		set.delete(controller);
		if (set.size === 0) {
			this.controllers.delete(conversationId);
		}
	}
}
