export function formatUserCount(userCount: number): string {
	const userCountRanges: { min: number; max: number; label: string }[] = [
		{ min: 0, max: 1, label: "1" },
		{ min: 2, max: 9, label: "1-10" },
		{ min: 10, max: 49, label: "10+" },
		{ min: 50, max: 99, label: "50+" },
		{ min: 100, max: 299, label: "100+" },
		{ min: 300, max: 499, label: "300+" },
		{ min: 500, max: 999, label: "500+" },
		{ min: 1_000, max: 2_999, label: "1k+" },
		{ min: 3_000, max: 4_999, label: "3k+" },
		{ min: 5_000, max: 9_999, label: "5k+" },
		{ min: 10_000, max: 19_999, label: "10k+" },
		{ min: 20_000, max: 29_999, label: "20k+" },
		{ min: 30_000, max: 39_999, label: "30k+" },
		{ min: 40_000, max: 49_999, label: "40k+" },
		{ min: 50_000, max: 59_999, label: "50k+" },
		{ min: 60_000, max: 69_999, label: "60k+" },
		{ min: 70_000, max: 79_999, label: "70k+" },
		{ min: 80_000, max: 89_999, label: "80k+" },
		{ min: 90_000, max: 99_999, label: "90k+" },
		{ min: 100_000, max: 109_999, label: "100k+" },
		{ min: 110_000, max: 119_999, label: "110k+" },
		{ min: 120_000, max: 129_999, label: "120k+" },
		{ min: 130_000, max: 139_999, label: "130k+" },
		{ min: 140_000, max: 149_999, label: "140k+" },
		{ min: 150_000, max: 199_999, label: "150k+" },
		{ min: 200_000, max: 299_999, label: "200k+" },
		{ min: 300_000, max: 499_999, label: "300k+" },
		{ min: 500_000, max: 749_999, label: "500k+" },
		{ min: 750_000, max: 999_999, label: "750k+" },
		{ min: 1_000_000, max: Infinity, label: "1M+" },
	];

	const range = userCountRanges.find(({ min, max }) => userCount >= min && userCount <= max);
	return range?.label ?? "";
}
