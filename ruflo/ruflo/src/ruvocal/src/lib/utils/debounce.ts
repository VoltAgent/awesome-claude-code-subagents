/**
 * A debounce function that works in both browser and Nodejs.
 * For pure Nodejs work, prefer the `Debouncer` class.
 */
export function debounce<T extends unknown[]>(
	callback: (...rest: T) => unknown,
	limit: number
): (...rest: T) => void {
	let timer: ReturnType<typeof setTimeout>;

	return function (...rest) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			callback(...rest);
		}, limit);
	};
}
