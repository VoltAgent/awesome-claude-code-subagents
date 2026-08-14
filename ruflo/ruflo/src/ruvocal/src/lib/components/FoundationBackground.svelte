<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";

	interface Props {
		opacity?: number;
	}

	let { opacity = 0.6 }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let animationFrame: number;

	// Mathematical glyphs for Foundation aesthetic
	const GLYPHS = ['∑', '∫', '∂', '∞', '∇', 'Δ', 'Ψ', 'Ω', 'π', 'λ', 'θ', 'φ', 'ξ', '∈', '∀', '∃', '⊕', '⊗', '≡', '≈'];

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		opacity: number;
		glyph?: string;
		isGlyph: boolean;
		phase: number;
		speed: number;
	}

	interface Connection {
		from: number;
		to: number;
		opacity: number;
	}

	let particles: Particle[] = [];
	let connections: Connection[] = [];
	let time = 0;
	let mouseX = 0.5;
	let mouseY = 0.5;

	function initParticles(width: number, height: number) {
		particles = [];
		const particleCount = Math.floor((width * height) / 15000);
		const glyphCount = Math.floor(particleCount * 0.15);

		for (let i = 0; i < particleCount; i++) {
			const isGlyph = i < glyphCount;
			particles.push({
				x: Math.random() * width,
				y: Math.random() * height,
				vx: (Math.random() - 0.5) * 0.3,
				vy: (Math.random() - 0.5) * 0.3,
				size: isGlyph ? 12 + Math.random() * 8 : 1 + Math.random() * 2,
				opacity: 0.1 + Math.random() * 0.5,
				glyph: isGlyph ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : undefined,
				isGlyph,
				phase: Math.random() * Math.PI * 2,
				speed: 0.5 + Math.random() * 1.5,
			});
		}
	}

	function updateConnections() {
		connections = [];
		const maxDist = 120;

		for (let i = 0; i < particles.length; i++) {
			for (let j = i + 1; j < particles.length; j++) {
				const dx = particles[i].x - particles[j].x;
				const dy = particles[i].y - particles[j].y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (dist < maxDist) {
					connections.push({
						from: i,
						to: j,
						opacity: (1 - dist / maxDist) * 0.15,
					});
				}
			}
		}
	}

	function animate() {
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;

		// Clear with fade effect
		ctx.fillStyle = "rgba(2, 2, 5, 0.15)";
		ctx.fillRect(0, 0, width, height);

		time += 0.008;

		// Update particles
		particles.forEach((p, i) => {
			// Mouse influence
			const dx = mouseX * width - p.x;
			const dy = mouseY * height - p.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 200) {
				const force = (200 - dist) / 200 * 0.02;
				p.vx += dx * force * 0.01;
				p.vy += dy * force * 0.01;
			}

			// Drift
			p.x += p.vx + Math.sin(time * p.speed + p.phase) * 0.2;
			p.y += p.vy + Math.cos(time * p.speed + p.phase) * 0.2;

			// Damping
			p.vx *= 0.99;
			p.vy *= 0.99;

			// Wrap around
			if (p.x < -50) p.x = width + 50;
			if (p.x > width + 50) p.x = -50;
			if (p.y < -50) p.y = height + 50;
			if (p.y > height + 50) p.y = -50;

			// Pulse opacity
			const pulseOpacity = p.opacity * (0.5 + Math.sin(time * 2 + p.phase) * 0.5);

			if (p.isGlyph && p.glyph) {
				// Draw glyph
				ctx.save();
				ctx.font = `${p.size}px "SF Mono", "Fira Code", monospace`;
				ctx.fillStyle = `rgba(232, 166, 52, ${pulseOpacity * 0.6})`;
				ctx.shadowColor = "#e8a634";
				ctx.shadowBlur = 8;
				ctx.fillText(p.glyph, p.x, p.y);
				ctx.restore();
			} else {
				// Draw particle
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(232, 166, 52, ${pulseOpacity})`;
				ctx.fill();
			}
		});

		// Update connections periodically
		if (Math.floor(time * 10) % 5 === 0) {
			updateConnections();
		}

		// Draw connections
		connections.forEach((c) => {
			const p1 = particles[c.from];
			const p2 = particles[c.to];
			if (!p1 || !p2) return;
			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.strokeStyle = `rgba(232, 166, 52, ${c.opacity})`;
			ctx.lineWidth = 0.5;
			ctx.stroke();
		});

		// Draw orbital rings
		const centerX = width / 2;
		const centerY = height / 2;
		const rings = [
			{ radius: 180, rotation: time * 0.3, opacity: 0.08 },
			{ radius: 250, rotation: -time * 0.2, opacity: 0.06 },
			{ radius: 320, rotation: time * 0.15, opacity: 0.04 },
		];

		rings.forEach((ring) => {
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(ring.rotation);
			ctx.beginPath();
			ctx.ellipse(0, 0, ring.radius, ring.radius * 0.3, 0, 0, Math.PI * 2);
			ctx.strokeStyle = `rgba(232, 166, 52, ${ring.opacity})`;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.restore();
		});

		// Central core glow
		const coreGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100);
		coreGlow.addColorStop(0, `rgba(232, 166, 52, ${0.15 + Math.sin(time * 3) * 0.05})`);
		coreGlow.addColorStop(0.5, "rgba(232, 166, 52, 0.02)");
		coreGlow.addColorStop(1, "transparent");
		ctx.fillStyle = coreGlow;
		ctx.beginPath();
		ctx.arc(centerX, centerY, 100, 0, Math.PI * 2);
		ctx.fill();

		animationFrame = requestAnimationFrame(animate);
	}

	function handleResize() {
		if (!canvas) return;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		initParticles(canvas.width, canvas.height);
	}

	function handleMouseMove(e: MouseEvent) {
		mouseX = e.clientX / window.innerWidth;
		mouseY = e.clientY / window.innerHeight;
	}

	onMount(() => {
		if (!browser || !canvas) return;
		handleResize();
		animate();
		window.addEventListener("resize", handleResize);
		window.addEventListener("mousemove", handleMouseMove);
	});

	onDestroy(() => {
		if (!browser) return;
		cancelAnimationFrame(animationFrame);
		window.removeEventListener("resize", handleResize);
		window.removeEventListener("mousemove", handleMouseMove);
	});
</script>

<canvas
	bind:this={canvas}
	class="foundation-bg"
	style="opacity: {opacity}"
></canvas>

<style>
	.foundation-bg {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		pointer-events: none;
	}
</style>
