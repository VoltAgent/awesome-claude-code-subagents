import { browser } from "$app/environment";

export function isVirtualKeyboard(): boolean {
	if (!browser) return false;

	// Check for touch capability
	if (navigator.maxTouchPoints > 0 && screen.width <= 768) return true;

	// Check for touch events
	if ("ontouchstart" in window) return true;

	// Fallback to user agent string check
	const userAgent = navigator.userAgent.toLowerCase();

	return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
}
