// Approximate width from which we disable autofocus
const TABLET_VIEWPORT_WIDTH = 768;

export function isDesktop(window: Window) {
	const { innerWidth } = window;
	return innerWidth > TABLET_VIEWPORT_WIDTH;
}
