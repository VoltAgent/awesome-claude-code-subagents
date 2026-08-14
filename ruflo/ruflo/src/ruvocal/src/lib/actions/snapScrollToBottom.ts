import { navigating } from "$app/state";
import { tick } from "svelte";

// Threshold to determine if user is "at bottom" - larger value prevents false detachment
const BOTTOM_THRESHOLD = 50;
const USER_SCROLL_DEBOUNCE_MS = 150;
const PROGRAMMATIC_SCROLL_GRACE_MS = 100;
const TOUCH_DETACH_THRESHOLD_PX = 10;

interface ScrollDependency {
	signal: unknown;
	forceReattach?: number;
}

type MaybeScrollDependency = ScrollDependency | unknown;

const getForceReattach = (value: MaybeScrollDependency): number => {
	if (typeof value === "object" && value !== null && "forceReattach" in value) {
		return (value as ScrollDependency).forceReattach ?? 0;
	}
	return 0;
};

/**
 * Auto-scroll action that snaps to bottom while respecting user scroll intent.
 *
 * Key behaviors:
 * 1. Uses wheel/touch events to detect actual user intent
 * 2. Uses IntersectionObserver on a sentinel element to reliably detect "at bottom" state
 * 3. Larger threshold to prevent edge-case false detachments
 *
 * @param node element to snap scroll to bottom
 * @param dependency pass in { signal, forceReattach } - signal triggers scroll updates,
 *                   forceReattach (counter) forces re-attachment when incremented
 */
export const snapScrollToBottom = (node: HTMLElement, dependency: MaybeScrollDependency) => {
	// --- State ----------------------------------------------------------------

	// Track whether user has intentionally scrolled away from bottom
	let isDetached = false;

	// Track the last forceReattach value to detect changes
	let lastForceReattach = getForceReattach(dependency);

	// Track if user is actively scrolling (via wheel/touch)
	let userScrolling = false;
	let userScrollTimeout: ReturnType<typeof setTimeout> | undefined;

	// Track programmatic scrolls to avoid treating them as user scrolls
	let isProgrammaticScroll = false;
	let lastProgrammaticScrollTime = 0;

	// Track previous scroll position to detect scrollbar drags
	let prevScrollTop = node.scrollTop;

	// Touch handling state
	let touchStartY = 0;

	// Observers and sentinel
	let resizeObserver: ResizeObserver | undefined;
	let intersectionObserver: IntersectionObserver | undefined;
	let sentinel: HTMLDivElement | undefined;

	// Track content height for early-return optimization during streaming
	let lastScrollHeight = node.scrollHeight;

	// --- Helpers --------------------------------------------------------------

	const clearUserScrollTimeout = () => {
		if (userScrollTimeout) {
			clearTimeout(userScrollTimeout);
			userScrollTimeout = undefined;
		}
	};

	const distanceFromBottom = () => node.scrollHeight - node.scrollTop - node.clientHeight;

	const isAtBottom = () => distanceFromBottom() <= BOTTOM_THRESHOLD;

	const scrollToBottom = () => {
		isProgrammaticScroll = true;
		lastProgrammaticScrollTime = Date.now();

		node.scrollTo({ top: node.scrollHeight });

		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => {
				isProgrammaticScroll = false;
			});
		} else {
			isProgrammaticScroll = false;
		}
	};

	const settleScrollAfterLayout = async () => {
		if (typeof requestAnimationFrame !== "function") return;

		const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

		await raf();
		if (!userScrolling && !isDetached) {
			scrollToBottom();
		}

		await raf();
		if (!userScrolling && !isDetached) {
			scrollToBottom();
		}
	};

	const scheduleUserScrollEndCheck = () => {
		userScrolling = true;
		clearUserScrollTimeout();

		userScrollTimeout = setTimeout(() => {
			userScrolling = false;

			// If user scrolled back to bottom, re-attach
			if (isAtBottom()) {
				isDetached = false;
			}

			// Re-trigger scroll if still attached, to catch content that arrived during scrolling
			if (!isDetached) {
				scrollToBottom();
			}
		}, USER_SCROLL_DEBOUNCE_MS);
	};

	const createSentinel = () => {
		sentinel = document.createElement("div");
		sentinel.style.height = "1px";
		sentinel.style.width = "100%";
		sentinel.setAttribute("aria-hidden", "true");
		sentinel.setAttribute("data-scroll-sentinel", "");

		// Find the content container (first child) and append sentinel there
		const container = node.firstElementChild;
		if (container) {
			container.appendChild(sentinel);
		} else {
			node.appendChild(sentinel);
		}
	};

	const setupIntersectionObserver = () => {
		if (typeof IntersectionObserver === "undefined" || !sentinel) return;

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];

				// If sentinel is visible and user isn't actively scrolling, we're at bottom
				if (entry?.isIntersecting && !userScrolling) {
					isDetached = false;
					// Immediately scroll to catch up with any content that arrived while detached
					scrollToBottom();
				}
			},
			{
				root: node,
				threshold: 0,
				rootMargin: `0px 0px ${BOTTOM_THRESHOLD}px 0px`,
			}
		);

		intersectionObserver.observe(sentinel);
	};

	const setupResizeObserver = () => {
		if (typeof ResizeObserver === "undefined") return;

		const target = node.firstElementChild ?? node;
		resizeObserver = new ResizeObserver(() => {
			// Don't auto-scroll if user has detached and we're not navigating
			if (isDetached && !navigating.to) return;
			// Don't interrupt active user scrolling
			if (userScrolling) return;

			scrollToBottom();
		});

		resizeObserver.observe(target);
	};

	// --- Action update logic --------------------------------------------------

	const handleForceReattach = async (newDependency: MaybeScrollDependency) => {
		const forceReattach = getForceReattach(newDependency);

		if (forceReattach > lastForceReattach) {
			lastForceReattach = forceReattach;
			isDetached = false;
			userScrolling = false;
			clearUserScrollTimeout();

			await tick();
			scrollToBottom();
			return true;
		}

		return false;
	};

	async function updateScroll(newDependency?: MaybeScrollDependency) {
		// 1. Explicit force re-attach
		if (newDependency && (await handleForceReattach(newDependency))) {
			return;
		}

		// 2. Don't scroll if user has detached and we're not navigating
		if (isDetached && !navigating.to) return;

		// 3. Don't scroll if user is actively scrolling
		if (userScrolling) return;

		// 4. Early return if already at bottom and no content change (perf optimization for streaming)
		const currentHeight = node.scrollHeight;
		if (isAtBottom() && currentHeight === lastScrollHeight) {
			return;
		}
		lastScrollHeight = currentHeight;

		// 5. Wait for DOM to update, then scroll and settle after layout shifts
		await tick();
		scrollToBottom();
		await settleScrollAfterLayout();
	}

	// --- Event handlers -------------------------------------------------------

	// Detect user scroll intent via wheel events (mouse/trackpad)
	const handleWheel = (event: WheelEvent) => {
		const { deltaY } = event;

		// User is scrolling up - detach
		if (deltaY < 0) {
			isDetached = true;
		}

		// User is scrolling down - check for re-attachment immediately
		// This ensures fast re-attachment when user scrolls to bottom during fast generation
		if (deltaY > 0 && isAtBottom()) {
			isDetached = false;
			userScrolling = false;
			clearUserScrollTimeout();
			scrollToBottom();
			return;
		}

		scheduleUserScrollEndCheck();
	};

	// Detect user scroll intent via touch events (mobile)
	const handleTouchStart = (event: TouchEvent) => {
		touchStartY = event.touches[0]?.clientY ?? 0;
	};

	const handleTouchMove = (event: TouchEvent) => {
		const touchY = event.touches[0]?.clientY ?? 0;
		const deltaY = touchStartY - touchY;

		// User is scrolling up (finger moving down)
		if (deltaY < -TOUCH_DETACH_THRESHOLD_PX) {
			isDetached = true;
		}

		// User is scrolling down (finger moving up) - check for re-attachment immediately
		if (deltaY > TOUCH_DETACH_THRESHOLD_PX && isAtBottom()) {
			isDetached = false;
			userScrolling = false;
			clearUserScrollTimeout();
			scrollToBottom();
			touchStartY = touchY;
			return;
		}

		scheduleUserScrollEndCheck();
		touchStartY = touchY;
	};

	// Handle scroll events to detect scrollbar usage and re-attach when at bottom
	const handleScroll = () => {
		const now = Date.now();
		const timeSinceLastProgrammaticScroll = now - lastProgrammaticScrollTime;
		const inGracePeriod =
			isProgrammaticScroll || timeSinceLastProgrammaticScroll < PROGRAMMATIC_SCROLL_GRACE_MS;

		// If not from wheel/touch, this is likely a scrollbar drag
		if (!userScrolling) {
			const scrollingUp = node.scrollTop < prevScrollTop;

			// Always allow detach (scrolling up) - don't ignore user intent
			if (scrollingUp) {
				isDetached = true;
			}

			// Only re-attach when at bottom if NOT in grace period
			// (avoids false re-attach from content resize pushing scroll position)
			if (!inGracePeriod && isAtBottom()) {
				isDetached = false;
				// Immediately scroll to catch up with any content that arrived while detached
				scrollToBottom();
			}
		}

		prevScrollTop = node.scrollTop;
	};

	// --- Setup ----------------------------------------------------------------

	node.addEventListener("wheel", handleWheel, { passive: true });
	node.addEventListener("touchstart", handleTouchStart, { passive: true });
	node.addEventListener("touchmove", handleTouchMove, { passive: true });
	node.addEventListener("scroll", handleScroll, { passive: true });

	createSentinel();
	setupIntersectionObserver();
	setupResizeObserver();

	// Initial scroll if we have content
	if (dependency) {
		void (async () => {
			await tick();
			scrollToBottom();
		})();
	}

	// --- Cleanup --------------------------------------------------------------

	return {
		update: updateScroll,
		destroy: () => {
			clearUserScrollTimeout();

			node.removeEventListener("wheel", handleWheel);
			node.removeEventListener("touchstart", handleTouchStart);
			node.removeEventListener("touchmove", handleTouchMove);
			node.removeEventListener("scroll", handleScroll);

			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			sentinel?.remove();
		},
	};
};
