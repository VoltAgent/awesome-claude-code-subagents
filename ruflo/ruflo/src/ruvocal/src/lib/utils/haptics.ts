import { browser } from "$app/environment";
import type { WebHaptics } from "web-haptics";

let instance: WebHaptics | null = null;
let enabled = true;

/**
 * Lazily initializes the WebHaptics instance on first use.
 * Avoids importing at module level so SSR doesn't break.
 */
async function getInstance(): Promise<WebHaptics | null> {
	if (!browser || !supportsHaptics()) return null;
	if (instance) return instance;

	try {
		const { WebHaptics: WH } = await import("web-haptics");
		instance = new WH();
		return instance;
	} catch {
		return null;
	}
}

/** Call from the settings store to keep haptics in sync with user preference. */
export function setHapticsEnabled(value: boolean) {
	enabled = value;
}

/** Whether the device likely supports haptic feedback (touch screen present). */
export function supportsHaptics(): boolean {
	return browser && navigator.maxTouchPoints > 0;
}

// ── Internals ────────────────────────────────────────────────────────

/** Fire a haptic pattern, swallowing errors so callers can safely fire-and-forget. */
function fire(pattern: string): void {
	if (!enabled) return;
	Promise.resolve(getInstance())
		.then((h) => h?.trigger(pattern))
		.catch(() => {});
}

// ── Semantic haptic actions ──────────────────────────────────────────

/** Light tap — for routine actions (send message, toggle, navigate). */
export function tap() {
	fire("light");
}

/** Success confirmation — double-tap pattern (copy, share, save). */
export function confirm() {
	fire("success");
}

/** Error / destructive warning — three rapid taps (delete, stop generation). */
export function error() {
	fire("error");
}

/** Selection change — subtle tap for pickers and selections. */
export function selection() {
	fire("selection");
}
