import type { Model } from "$lib/types/Model";

export const findCurrentModel = (
	models: Model[],
	_oldModels: { id: string; transferTo?: string }[] = [],
	id?: string
): Model => {
	if (id) {
		const direct = models.find((m) => m.id === id);
		if (direct) return direct;
	}

	return models[0];
};
