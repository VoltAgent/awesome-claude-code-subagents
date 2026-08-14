type Gen<T, TReturn> = AsyncGenerator<T, TReturn, undefined>;

type GenPromiseMap<T, TReturn> = Map<
	Gen<T, TReturn>,
	Promise<{ gen: Gen<T, TReturn> } & IteratorResult<T, TReturn>>
>;

/** Merges multiple async generators into a single async generator that yields values from all of them in parallel. */
export async function* mergeAsyncGenerators<T, TReturn>(
	generators: Gen<T, TReturn>[]
): Gen<T, TReturn[]> {
	const promises: GenPromiseMap<T, TReturn> = new Map();
	const results: Map<Gen<T, TReturn>, TReturn> = new Map();

	for (const gen of generators) {
		promises.set(
			gen,
			gen.next().then((result) => ({ gen, ...result }))
		);
	}

	while (promises.size) {
		const { gen, value, done } = await Promise.race(promises.values());
		if (done) {
			results.set(gen, value as TReturn);
			promises.delete(gen);
		} else {
			promises.set(
				gen,
				gen.next().then((result) => ({ gen, ...result }))
			);
			yield value as T;
		}
	}

	const orderedResults = generators.map((gen) => results.get(gen) as TReturn);
	return orderedResults;
}
