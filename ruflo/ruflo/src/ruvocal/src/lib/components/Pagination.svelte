<script lang="ts">
	import { page } from "$app/state";
	import { getHref } from "$lib/utils/getHref";
	import PaginationArrow from "./PaginationArrow.svelte";

	interface Props {
		classNames?: string;
		numItemsPerPage: number;
		numTotalItems: number;
	}

	let { classNames = "", numItemsPerPage, numTotalItems }: Props = $props();

	const ELLIPSIS_IDX = -1 as const;

	function getPageIndexes(pageIdx: number, nTotalPages: number) {
		let pageIdxs: number[] = [];

		const NUM_EXTRA_BUTTONS = 2; // The number of page links to show on either side of the current page link.

		const minIdx = 0;
		const maxIdx = nTotalPages - 1;

		pageIdxs = [pageIdx];

		// forward
		for (let i = 1; i < NUM_EXTRA_BUTTONS + 1; i++) {
			const newPageIdx = pageIdx + i;
			if (newPageIdx > maxIdx) {
				continue;
			}
			pageIdxs.push(newPageIdx);
		}
		if (maxIdx - pageIdxs[pageIdxs.length - 1] > 1) {
			pageIdxs.push(...[ELLIPSIS_IDX, maxIdx]);
		} else if (maxIdx - pageIdxs[pageIdxs.length - 1] === 1) {
			pageIdxs.push(maxIdx);
		}

		// backward
		for (let i = 1; i < NUM_EXTRA_BUTTONS + 1; i++) {
			const newPageIdx = pageIdx - i;
			if (newPageIdx < minIdx) {
				continue;
			}
			pageIdxs.unshift(newPageIdx);
		}
		if (pageIdxs[0] - minIdx > 1) {
			pageIdxs.unshift(...[minIdx, ELLIPSIS_IDX]);
		} else if (pageIdxs[0] - minIdx === 1) {
			pageIdxs.unshift(minIdx);
		}
		return pageIdxs;
	}
	let numTotalPages = $derived(Math.ceil(numTotalItems / numItemsPerPage));
	let pageIndex = $derived(parseInt(page.url.searchParams.get("p") ?? "0"));
	let pageIndexes = $derived(getPageIndexes(pageIndex, numTotalPages));
</script>

{#if numTotalPages > 1}
	<nav>
		<ul
			class="flex select-none items-center justify-between space-x-2 text-gray-700 dark:text-gray-300 sm:justify-center {classNames}"
		>
			<li>
				<PaginationArrow
					href={getHref(page.url, { newKeys: { p: (pageIndex - 1).toString() } })}
					direction="previous"
					isDisabled={pageIndex - 1 < 0}
				/>
			</li>
			{#each pageIndexes as pageIdx}
				<li class="hidden sm:block">
					<a
						class="
							rounded-lg px-2.5 py-1
							{pageIndex === pageIdx
							? 'bg-gray-50 font-semibold ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-yellow-500 dark:ring-gray-700'
							: ''}
						"
						class:pointer-events-none={pageIdx === ELLIPSIS_IDX || pageIndex === pageIdx}
						href={getHref(page.url, { newKeys: { p: pageIdx.toString() } })}
					>
						{pageIdx === ELLIPSIS_IDX ? "..." : pageIdx + 1}
					</a>
				</li>
			{/each}
			<li>
				<PaginationArrow
					href={getHref(page.url, { newKeys: { p: (pageIndex + 1).toString() } })}
					direction="next"
					isDisabled={pageIndex + 1 >= numTotalPages}
				/>
			</li>
		</ul>
	</nav>
{/if}
