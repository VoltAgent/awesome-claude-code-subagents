import { browser } from "$app/environment";
import { invalidate } from "$app/navigation";
import { base } from "$app/paths";
import type { StreamingMode } from "$lib/types/Settings";
import { UrlDependency } from "$lib/types/UrlDependency";
import { getContext, setContext } from "svelte";
import { type Writable, writable, get } from "svelte/store";

type SettingsStore = {
	shareConversationsWithModelAuthors: boolean;
	welcomeModalSeen: boolean;
	welcomeModalSeenAt: Date | null;
	activeModel: string;
	customPrompts: Record<string, string>;
	multimodalOverrides: Record<string, boolean>;
	toolsOverrides: Record<string, boolean>;
	hidePromptExamples: Record<string, boolean>;
	providerOverrides: Record<string, string>;
	recentlySaved: boolean;
	streamingMode: StreamingMode;
	directPaste: boolean;
	hapticsEnabled: boolean;
	autopilotEnabled: boolean;
	billingOrganization?: string;
};

type SettingsStoreWritable = Writable<SettingsStore> & {
	instantSet: (settings: Partial<SettingsStore>) => Promise<void>;
	initValue: <K extends keyof SettingsStore>(
		key: K,
		nestedKey: string,
		value: string | boolean
	) => Promise<void>;
};

export function useSettingsStore() {
	return getContext<SettingsStoreWritable>("settings");
}

export function createSettingsStore(
	initialValue: Omit<SettingsStore, "recentlySaved" | "autopilotEnabled"> &
		Partial<Pick<SettingsStore, "autopilotEnabled">>
) {
	const baseStore = writable({
		autopilotEnabled: true,
		...initialValue,
		recentlySaved: false,
	});

	let timeoutId: NodeJS.Timeout;
	let showSavedOnNextSync = false;

	async function setSettings(settings: Partial<SettingsStore>) {
		baseStore.update((s) => ({
			...s,
			...settings,
		}));

		if (browser) {
			showSavedOnNextSync = true; // User edit, should show "Saved"
			clearTimeout(timeoutId);
			timeoutId = setTimeout(async () => {
				await fetch(`${base}/settings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(get(baseStore)),
				});

				invalidate(UrlDependency.ConversationList);

				if (showSavedOnNextSync) {
					// set savedRecently to true for 3s
					baseStore.update((s) => ({
						...s,
						recentlySaved: true,
					}));
					setTimeout(() => {
						baseStore.update((s) => ({
							...s,
							recentlySaved: false,
						}));
					}, 3000);
				}

				showSavedOnNextSync = false;
			}, 300);
			// debounce server calls by 300ms
		}
	}

	async function initValue<K extends keyof SettingsStore>(
		key: K,
		nestedKey: string,
		value: string | boolean
	) {
		const currentStore = get(baseStore);
		const currentNestedObject = currentStore[key] as Record<string, string | boolean>;

		// Only initialize if undefined
		if (currentNestedObject?.[nestedKey] !== undefined) {
			return;
		}

		// Update the store
		const newNestedObject = {
			...(currentNestedObject || {}),
			[nestedKey]: value,
		};

		baseStore.update((s) => ({
			...s,
			[key]: newNestedObject,
		}));

		// Save to server (debounced) - note: we don't set showSavedOnNextSync
		if (browser) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(async () => {
				await fetch(`${base}/settings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(get(baseStore)),
				});

				invalidate(UrlDependency.ConversationList);

				if (showSavedOnNextSync) {
					baseStore.update((s) => ({
						...s,
						recentlySaved: true,
					}));
					setTimeout(() => {
						baseStore.update((s) => ({
							...s,
							recentlySaved: false,
						}));
					}, 3000);
				}

				showSavedOnNextSync = false;
			}, 300);
		}
	}
	async function instantSet(settings: Partial<SettingsStore>) {
		baseStore.update((s) => ({
			...s,
			...settings,
		}));

		if (browser) {
			await fetch(`${base}/settings`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...get(baseStore),
					...settings,
				}),
			});
			invalidate(UrlDependency.ConversationList);
		}
	}

	const newStore = {
		subscribe: baseStore.subscribe,
		set: setSettings,
		instantSet,
		initValue,
		update: (fn: (s: SettingsStore) => SettingsStore) => {
			setSettings(fn(get(baseStore)));
		},
	} satisfies SettingsStoreWritable;

	setContext("settings", newStore);

	return newStore;
}
