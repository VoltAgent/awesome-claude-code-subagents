type UUID = ReturnType<typeof crypto.randomUUID>;

export function randomUUID(): UUID {
	// Only on old safari / ios
	if (!("randomUUID" in crypto)) {
		return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
			(
				Number(c) ^
				(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
			).toString(16)
		) as UUID;
	}
	return crypto.randomUUID();
}
