export function deepestChild(el: HTMLElement): HTMLElement {
	if (el.lastElementChild && el.lastElementChild.nodeType !== Node.TEXT_NODE) {
		return deepestChild(el.lastElementChild as HTMLElement);
	}
	return el;
}
