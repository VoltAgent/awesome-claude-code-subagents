<script lang="ts" module>
	let isOpen = $state(false);

	export function closeMobileNav() {
		isOpen = false;
	}

	export function openMobileNav() {
		isOpen = true;
	}
</script>

<script lang="ts">
	import { browser } from "$app/environment";
	import { beforeNavigate } from "$app/navigation";
	import { onMount, onDestroy } from "svelte";
	import { base } from "$app/paths";
	import { page } from "$app/state";
	import IconNew from "$lib/components/icons/IconNew.svelte";
	import IconShare from "$lib/components/icons/IconShare.svelte";
	import IconBurger from "$lib/components/icons/IconBurger.svelte";
	import { Spring } from "svelte/motion";
	import { shareModal } from "$lib/stores/shareModal";
	import { loading } from "$lib/stores/loading";
	import { requireAuthUser } from "$lib/utils/auth";
	import { tap } from "$lib/utils/haptics";

	interface Props {
		title: string | undefined;
		children?: import("svelte").Snippet;
	}

	let { title = $bindable(), children }: Props = $props();

	let closeEl: HTMLButtonElement | undefined = $state();
	let openEl: HTMLButtonElement | undefined = $state();

	const isHuggingChat = $derived(Boolean(page.data?.publicConfig?.isHuggingChat));
	const canShare = $derived(
		isHuggingChat &&
			!$loading &&
			Boolean(page.params?.id) &&
			page.route.id?.startsWith("/conversation/")
	);

	// Define the width for the drawer (less than 100% to create the gap)
	const drawerWidthPercentage = 85;

	$effect(() => {
		title ??= "New Chat";
	});

	beforeNavigate(() => {
		isOpen = false;
	});

	let shouldFocusClose = $derived(isOpen && closeEl);
	let shouldRefocusOpen = $derived(!isOpen && browser && document.activeElement === closeEl);

	$effect(() => {
		if (shouldFocusClose) {
			closeEl?.focus();
		} else if (shouldRefocusOpen) {
			openEl?.focus();
		}
	});

	// Function to close the drawer when background is tapped
	function closeDrawer() {
		isOpen = false;
	}

	// Swipe gesture support for opening/closing the nav with live feedback
	// Thresholds from vaul drawer library
	const VELOCITY_THRESHOLD = 0.4; // px/ms - if exceeded, snap in swipe direction
	const DIRECTION_LOCK_THRESHOLD = 10; // px - movement needed to lock direction

	let touchstart: Touch | null = null;
	let lastTouchX: number | null = null;
	let dragStartTime: number = 0;
	let isDragging = $state(false);
	let dragOffset = $state(-100); // percentage: -100 (closed) to 0 (open)
	let dragStartedOpen = false;

	// Direction lock: null = undecided, 'horizontal' = drawer drag, 'vertical' = scroll
	let directionLock: "horizontal" | "vertical" | null = null;
	let potentialDrag = false;

	// Spring target: follows dragOffset during drag, follows isOpen after drag ends
	const springTarget = $derived(isDragging ? dragOffset : isOpen ? 0 : -100);
	const tween = Spring.of(() => springTarget, { stiffness: 0.2, damping: 0.8 });

	function onTouchStart(e: TouchEvent) {
		// Ignore touch events when a modal is open (app is inert)
		if (document.getElementById("app")?.hasAttribute("inert")) return;

		const touch = e.changedTouches[0];
		touchstart = touch;
		dragStartTime = Date.now();
		directionLock = null;

		const drawerWidth = window.innerWidth * (drawerWidthPercentage / 100);
		const touchOnDrawer = isOpen && touch.clientX < drawerWidth;

		// Check if touch is on an interactive element (don't block taps on buttons/links)
		const target = e.target as HTMLElement;
		const isInteractive = target.closest("button, a, input, [role='button']");

		// Potential drag scenarios - never start isDragging until direction is locked
		// Exception: overlay tap (no scroll content, so no direction conflict)
		if (!isOpen && touch.clientX < 40) {
			// Opening gesture - wait for direction lock before starting drag
			// Prevent Safari's back navigation gesture on iOS (but not on interactive elements)
			if (!isInteractive) {
				e.preventDefault();
			}
			potentialDrag = true;
			dragStartedOpen = false;
		} else if (isOpen && !touchOnDrawer) {
			// Touch on overlay - can start immediately (no scroll conflict)
			potentialDrag = true;
			isDragging = true;
			dragStartedOpen = true;
			dragOffset = 0;
			directionLock = "horizontal";
		} else if (isOpen && touchOnDrawer) {
			// Touch on drawer content - wait for direction lock
			potentialDrag = true;
			dragStartedOpen = true;
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (!touchstart || !potentialDrag) return;

		const touch = e.changedTouches[0];
		const deltaX = touch.clientX - touchstart.clientX;
		const deltaY = touch.clientY - touchstart.clientY;

		// Determine direction lock if not yet decided
		if (directionLock === null) {
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);

			if (absX > DIRECTION_LOCK_THRESHOLD || absY > DIRECTION_LOCK_THRESHOLD) {
				if (absX > absY) {
					// Horizontal movement - commit to drawer drag
					directionLock = "horizontal";
					isDragging = true;
					dragOffset = dragStartedOpen ? 0 : -100;
				} else {
					// Vertical movement - abort potential drag, let content scroll
					directionLock = "vertical";
					potentialDrag = false;
					return;
				}
			} else {
				return;
			}
		}

		if (directionLock !== "horizontal") return;

		const drawerWidth = window.innerWidth * (drawerWidthPercentage / 100);

		if (dragStartedOpen) {
			dragOffset = Math.max(-100, Math.min(0, (deltaX / drawerWidth) * 100));
		} else {
			dragOffset = Math.max(-100, Math.min(0, -100 + (deltaX / drawerWidth) * 100));
		}

		lastTouchX = touch.clientX;
	}

	function onTouchEnd(e: TouchEvent) {
		if (!potentialDrag) return;

		if (!isDragging || !touchstart) {
			resetDragState();
			return;
		}

		const touch = e.changedTouches[0];
		const timeTaken = Date.now() - dragStartTime;
		const distMoved = touch.clientX - touchstart.clientX;
		const velocity = Math.abs(distMoved) / timeTaken;

		// Determine snap direction based on velocity first, then final movement direction
		if (velocity > VELOCITY_THRESHOLD) {
			isOpen = distMoved > 0;
		} else {
			// For slow drags, use the final movement direction (allows "change of mind")
			const finalDirection = lastTouchX !== null ? touch.clientX - lastTouchX : distMoved;
			isOpen = finalDirection > 0;
		}

		tap();
		resetDragState();
	}

	function onTouchCancel() {
		if (isDragging) {
			isOpen = dragStartedOpen;
		}
		resetDragState();
	}

	function resetDragState() {
		isDragging = false;
		potentialDrag = false;
		touchstart = null;
		lastTouchX = null;
		directionLock = null;
	}

	onMount(() => {
		// touchstart needs passive: false to allow preventDefault() for Safari back gesture
		window.addEventListener("touchstart", onTouchStart, { passive: false });
		window.addEventListener("touchmove", onTouchMove, { passive: true });
		window.addEventListener("touchend", onTouchEnd, { passive: true });
		window.addEventListener("touchcancel", onTouchCancel, { passive: true });
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener("touchstart", onTouchStart);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", onTouchEnd);
			window.removeEventListener("touchcancel", onTouchCancel);
		}
	});
</script>

<nav
	class="mx-4 mt-4 flex h-12 items-center justify-between rounded-b-xl border-b bg-gray-50 px-3 dark:border-gray-800 dark:bg-gray-800/30 dark:shadow-xl max-md:rounded-xl max-md:border md:hidden"
>
	<button
		type="button"
		class="-ml-3 flex size-12 shrink-0 items-center justify-center text-lg"
		onclick={() => (isOpen = true)}
		aria-label="Open menu"
		bind:this={openEl}><IconBurger /></button
	>
	<div class="flex h-full items-center justify-center overflow-hidden">
		{#if page.params?.id}
			<span class="max-w-full truncate px-4 first-letter:uppercase" data-testid="chat-title"
				>{title}</span
			>
		{/if}
	</div>
	<div class="-mr-3 flex items-center">
		{#if isHuggingChat}
			<button
				type="button"
				class="flex h-12 w-6 shrink-0 items-center justify-center text-lg"
				disabled={!canShare}
				onclick={() => {
					if (!canShare) return;
					shareModal.open();
				}}
				aria-label="Share conversation"
			>
				<IconShare classNames={!canShare ? "opacity-40" : ""} />
			</button>
		{/if}
		<a
			href="{base}/"
			class="flex size-12 shrink-0 items-center justify-center text-lg"
			onclick={(e) => {
				if (requireAuthUser()) {
					e.preventDefault();
				}
			}}
		>
			<IconNew />
		</a>
	</div>
</nav>

<!-- Mobile drawer overlay - shows when drawer is open or dragging -->
{#if isOpen || isDragging}
	<button
		type="button"
		class="fixed inset-0 z-20 cursor-default bg-black/30 md:hidden"
		style="opacity: {Math.max(0, Math.min(1, (100 + tween.current) / 100))}; will-change: opacity;"
		onclick={closeDrawer}
		aria-label="Close mobile navigation"
	></button>
{/if}

<nav
	style="transform: translateX({isDragging
		? dragOffset
		: tween.current}%); width: {drawerWidthPercentage}%; will-change: transform;"
	class:shadow-[5px_0_15px_0_rgba(0,0,0,0.3)]={isOpen || isDragging}
	class="fixed bottom-0 left-0 top-0 z-30 grid max-h-dvh grid-cols-1
	grid-rows-[auto,1fr,auto,auto] rounded-r-xl bg-white pt-4 dark:bg-gray-900 md:hidden"
>
	{@render children?.()}
</nav>
