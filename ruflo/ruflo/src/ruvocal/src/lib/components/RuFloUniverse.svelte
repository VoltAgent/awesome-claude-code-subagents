<script lang="ts">
	import { onMount } from "svelte";

	interface Props {
		width?: number;
		height?: number;
	}

	let { width = 420, height = 192 }: Props = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio, 2);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		// Nodes — tightly clustered around center where RuFlo text sits
		const nodes = [
			{ x: 0.50, y: 0.50, r: 4, color: "#3b82f6" },
			{ x: 0.35, y: 0.42, r: 2.5, color: "#06b6d4" },
			{ x: 0.65, y: 0.42, r: 2.5, color: "#818cf8" },
			{ x: 0.38, y: 0.58, r: 2.5, color: "#2dd4bf" },
			{ x: 0.62, y: 0.58, r: 2.5, color: "#a78bfa" },
			{ x: 0.26, y: 0.50, r: 2, color: "#38bdf8" },
			{ x: 0.74, y: 0.50, r: 2, color: "#c084fc" },
			{ x: 0.44, y: 0.35, r: 2, color: "#22d3ee" },
			{ x: 0.56, y: 0.65, r: 2, color: "#6366f1" },
			{ x: 0.30, y: 0.62, r: 1.8, color: "#0ea5e9" },
			{ x: 0.70, y: 0.62, r: 1.8, color: "#8b5cf6" },
			{ x: 0.42, y: 0.70, r: 1.8, color: "#14b8a6" },
			{ x: 0.58, y: 0.35, r: 1.8, color: "#60a5fa" },
			{ x: 0.32, y: 0.34, r: 1.8, color: "#34d399" },
			{ x: 0.68, y: 0.34, r: 1.8, color: "#a855f7" },
		];

		const edges: [number, number][] = [
			[0, 1], [0, 2], [0, 3], [0, 4],
			[1, 5], [1, 7], [1, 13],
			[2, 6], [2, 12], [2, 14],
			[3, 5], [3, 8], [3, 9],
			[4, 6], [4, 10], [4, 14],
			[5, 9], [5, 13],
			[6, 10], [6, 14],
			[7, 12], [7, 13],
			[8, 9], [8, 11],
			[10, 14], [11, 9],
		];

		// Stars
		const stars = Array.from({ length: 120 }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			r: Math.random() * 1.2 + 0.3,
			phase: Math.random() * Math.PI * 2,
		}));

		// Particles traveling along edges
		const particles = edges.map((_, i) => ({
			edge: i,
			t: Math.random(),
			speed: 0.002 + Math.random() * 0.003,
		}));

		let animId: number;
		let time = 0;

		function draw() {
			animId = requestAnimationFrame(draw);
			time += 0.008;

			ctx.fillStyle = "#06060f";
			ctx.fillRect(0, 0, width, height);

			// Stars
			for (const s of stars) {
				const alpha = 0.3 + Math.sin(time * 1.5 + s.phase) * 0.2;
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255,255,255,${alpha})`;
				ctx.fill();
			}

			// Compute animated node positions
			const px = nodes.map((n, i) => n.x * width + Math.sin(time + i) * 3);
			const py = nodes.map((n, i) => n.y * height + Math.cos(time * 0.8 + i * 1.3) * 2);

			// Edges
			for (let i = 0; i < edges.length; i++) {
				const [a, b] = edges[i];
				const alpha = 0.12 + Math.sin(time * 1.5 + i) * 0.06;
				ctx.beginPath();
				ctx.moveTo(px[a], py[a]);
				ctx.lineTo(px[b], py[b]);
				ctx.strokeStyle = `rgba(59,130,246,${alpha})`;
				ctx.lineWidth = 1;
				ctx.stroke();
			}

			// Particles along edges
			for (const p of particles) {
				p.t = (p.t + p.speed) % 1;
				const [a, b] = edges[p.edge];
				const x = px[a] + (px[b] - px[a]) * p.t;
				const y = py[a] + (py[b] - py[a]) * p.t;
				ctx.beginPath();
				ctx.arc(x, y, 1.2, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(96,165,250,0.7)";
				ctx.fill();
			}

			// Orbital rings (ellipses) — centered with nodes and text
			ctx.save();
			ctx.translate(width * 0.5, height * 0.5);
			ctx.rotate(time * 0.2);
			ctx.beginPath();
			ctx.ellipse(0, 0, 45, 20, 0, 0, Math.PI * 2);
			ctx.strokeStyle = "rgba(59,130,246,0.1)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.restore();

			ctx.save();
			ctx.translate(width * 0.5, height * 0.5);
			ctx.rotate(-time * 0.15 + 0.5);
			ctx.beginPath();
			ctx.ellipse(0, 0, 55, 25, 0.4, 0, Math.PI * 2);
			ctx.strokeStyle = "rgba(129,140,248,0.07)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.restore();

			// Nodes with glow
			for (let i = 0; i < nodes.length; i++) {
				const n = nodes[i];
				const pulse = 1 + Math.sin(time * 2 + i * 0.7) * 0.15;
				const r = n.r * pulse;

				// Glow
				const grad = ctx.createRadialGradient(px[i], py[i], 0, px[i], py[i], r * 5);
				grad.addColorStop(0, n.color + "30");
				grad.addColorStop(1, n.color + "00");
				ctx.beginPath();
				ctx.arc(px[i], py[i], r * 5, 0, Math.PI * 2);
				ctx.fillStyle = grad;
				ctx.fill();

				// Core
				ctx.beginPath();
				ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
				ctx.fillStyle = n.color;
				ctx.fill();
			}
		}

		draw();

		return () => {
			cancelAnimationFrame(animId);
		};
	});
</script>

<div
	class="relative h-full w-full overflow-hidden"
	style="background: #06060f;"
>
	<canvas
		bind:this={canvas}
		style="width: {width}px; height: {height}px;"
	></canvas>
	<!-- Overlay text -->
	<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
		<h2
			class="text-3xl font-light tracking-[0.3em] text-indigo-100"
			style="text-shadow: 0 0 20px rgba(99, 102, 241, 0.5), 0 0 40px rgba(99, 102, 241, 0.2);"
		>
			RuFlo
		</h2>
		<p class="mt-1 text-[10px] tracking-[0.25em] text-slate-400/70">INTELLIGENT WORKFLOWS</p>
	</div>
</div>
