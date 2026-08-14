export function getHref(
	url: URL | string,
	modifications: {
		newKeys?: Record<string, string | undefined | null>;
		existingKeys?: { behaviour: "delete_except" | "delete"; keys: string[] };
	}
) {
	const newUrl = new URL(url);
	const { newKeys, existingKeys } = modifications;

	// exsiting keys logic
	if (existingKeys) {
		const { behaviour, keys } = existingKeys;
		if (behaviour === "delete") {
			for (const key of keys) {
				newUrl.searchParams.delete(key);
			}
		} else {
			// delete_except
			const keysToPreserve = keys;
			for (const key of [...newUrl.searchParams.keys()]) {
				if (!keysToPreserve.includes(key)) {
					newUrl.searchParams.delete(key);
				}
			}
		}
	}

	// new keys logic
	if (newKeys) {
		for (const [key, val] of Object.entries(newKeys)) {
			if (val) {
				newUrl.searchParams.set(key, val);
			} else {
				newUrl.searchParams.delete(key);
			}
		}
	}

	return newUrl.toString();
}
