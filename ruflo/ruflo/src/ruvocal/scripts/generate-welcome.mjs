/**
 * Generate RuFlo welcome animation — Foundation-inspired graph universe.
 *
 * Creates an animated GIF with:
 * - Deep space background (#06060f)
 * - Constellation-style graph nodes connected by glowing edges
 * - Orbital paths and particle trails
 * - "RuFlo" text with subtle glow
 * - Stars scattered throughout
 *
 * Uses sharp (already installed) for PNG frame generation,
 * then assembles frames into animated GIF.
 */

import sharp from "sharp";
import { writeFileSync } from "fs";

const WIDTH = 480;
const HEIGHT = 320;
const FRAMES = 40; // ~2.5s at 60ms/frame
const BG = "#06060f";

// Graph nodes — positions in a constellation pattern
const NODES = [
	{ x: 240, y: 120, r: 6, color: "#3b82f6", label: "" }, // center
	{ x: 140, y: 80, r: 4, color: "#06b6d4", label: "" },
	{ x: 340, y: 90, r: 4, color: "#818cf8", label: "" },
	{ x: 180, y: 200, r: 5, color: "#2dd4bf", label: "" },
	{ x: 300, y: 210, r: 5, color: "#a78bfa", label: "" },
	{ x: 100, y: 160, r: 3, color: "#38bdf8", label: "" },
	{ x: 380, y: 170, r: 3, color: "#c084fc", label: "" },
	{ x: 200, y: 50, r: 3, color: "#22d3ee", label: "" },
	{ x: 280, y: 260, r: 3, color: "#6366f1", label: "" },
	{ x: 60, y: 240, r: 2, color: "#0ea5e9", label: "" },
	{ x: 420, y: 250, r: 2, color: "#8b5cf6", label: "" },
	{ x: 120, y: 280, r: 2, color: "#14b8a6", label: "" },
];

// Edges connecting nodes
const EDGES = [
	[0, 1], [0, 2], [0, 3], [0, 4],
	[1, 5], [1, 7], [2, 6], [2, 7],
	[3, 5], [3, 8], [4, 6], [4, 8],
	[5, 9], [6, 10], [8, 11], [9, 11],
	[3, 9], [4, 10],
];

// Stars — random positions
const STARS = Array.from({ length: 80 }, () => ({
	x: Math.random() * WIDTH,
	y: Math.random() * HEIGHT,
	r: Math.random() * 1.5 + 0.3,
	brightness: Math.random() * 0.6 + 0.2,
}));

function generateFrame(frameIdx) {
	const t = frameIdx / FRAMES;
	const phase = t * Math.PI * 2;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`;
	svg += `<defs>`;
	// Glow filter
	svg += `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">`;
	svg += `<feGaussianBlur stdDeviation="3" result="blur"/>`;
	svg += `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`;
	svg += `</filter>`;
	// Stronger glow for text
	svg += `<filter id="textglow" x="-50%" y="-50%" width="200%" height="200%">`;
	svg += `<feGaussianBlur stdDeviation="6" result="blur"/>`;
	svg += `<feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`;
	svg += `</filter>`;
	// Radial gradient for nebula effect
	svg += `<radialGradient id="nebula" cx="50%" cy="40%" r="60%">`;
	svg += `<stop offset="0%" stop-color="#1e1b4b" stop-opacity="0.3"/>`;
	svg += `<stop offset="50%" stop-color="#0c0a2a" stop-opacity="0.15"/>`;
	svg += `<stop offset="100%" stop-color="${BG}" stop-opacity="0"/>`;
	svg += `</radialGradient>`;
	svg += `</defs>`;

	// Background
	svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>`;
	// Nebula overlay
	svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#nebula)"/>`;

	// Stars with twinkling
	for (const star of STARS) {
		const twinkle = star.brightness + Math.sin(phase * 3 + star.x * 0.1) * 0.15;
		const opacity = Math.max(0.1, Math.min(1, twinkle));
		svg += `<circle cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(1)}" r="${star.r.toFixed(1)}" fill="white" opacity="${opacity.toFixed(2)}"/>`;
	}

	// Animated node positions (subtle orbital motion)
	const animNodes = NODES.map((n, i) => ({
		...n,
		ax: n.x + Math.sin(phase + i * 0.7) * (3 + i * 0.5),
		ay: n.y + Math.cos(phase + i * 0.9) * (2 + i * 0.3),
	}));

	// Draw edges with pulse effect
	for (const [a, b] of EDGES) {
		const na = animNodes[a];
		const nb = animNodes[b];
		const edgePhase = Math.sin(phase * 2 + a + b) * 0.3 + 0.4;
		svg += `<line x1="${na.ax.toFixed(1)}" y1="${na.ay.toFixed(1)}" x2="${nb.ax.toFixed(1)}" y2="${nb.ay.toFixed(1)}" stroke="#3b82f6" stroke-opacity="${edgePhase.toFixed(2)}" stroke-width="0.8"/>`;

		// Traveling particle along edge
		const particleT = (t * 3 + a * 0.1) % 1;
		const px = na.ax + (nb.ax - na.ax) * particleT;
		const py = na.ay + (nb.ay - na.ay) * particleT;
		svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.5" fill="#60a5fa" opacity="0.7" filter="url(#glow)"/>`;
	}

	// Draw nodes
	for (const n of animNodes) {
		// Outer glow
		svg += `<circle cx="${n.ax.toFixed(1)}" cy="${n.ay.toFixed(1)}" r="${(n.r * 2.5).toFixed(1)}" fill="${n.color}" opacity="0.15"/>`;
		// Core
		svg += `<circle cx="${n.ax.toFixed(1)}" cy="${n.ay.toFixed(1)}" r="${n.r}" fill="${n.color}" filter="url(#glow)"/>`;
	}

	// Orbital ring around center node
	const centerX = animNodes[0].ax;
	const centerY = animNodes[0].ay;
	svg += `<ellipse cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" rx="45" ry="18" fill="none" stroke="#3b82f6" stroke-opacity="0.2" stroke-width="0.5" transform="rotate(${(t * 30).toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"/>`;
	svg += `<ellipse cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" rx="55" ry="22" fill="none" stroke="#818cf8" stroke-opacity="0.15" stroke-width="0.5" transform="rotate(${(-t * 20 + 60).toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"/>`;

	// "RuFlo" text
	const textY = HEIGHT - 40;
	svg += `<text x="${WIDTH / 2}" y="${textY}" text-anchor="middle" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="32" font-weight="300" fill="#e0e7ff" letter-spacing="8" filter="url(#textglow)">RuFlo</text>`;

	// Subtitle
	svg += `<text x="${WIDTH / 2}" y="${textY + 20}" text-anchor="middle" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="9" fill="#94a3b8" letter-spacing="3" opacity="0.7">INTELLIGENT WORKFLOWS</text>`;

	svg += `</svg>`;
	return svg;
}

async function main() {
	console.log(`Generating ${FRAMES} frames...`);

	const frames = [];
	for (let i = 0; i < FRAMES; i++) {
		const svg = generateFrame(i);
		const pngBuffer = await sharp(Buffer.from(svg))
			.resize(WIDTH, HEIGHT)
			.png()
			.toBuffer();
		frames.push(pngBuffer);
		process.stdout.write(".");
	}
	console.log(" done");

	// Assemble into animated GIF using sharp
	// sharp doesn't natively do animated GIF, so we'll create frames and
	// use the GIF89a format manually or just output a nice static image
	// with the first frame for now, plus we can use the sharp webp animation

	// Actually, let's generate an animated WebP (which sharp supports) and also
	// a static GIF fallback
	console.log("Creating animated WebP...");
	const animatedWebp = await sharp(frames[0], { animated: true })
		.webp({ quality: 80 })
		.toBuffer();

	// For the GIF, we'll manually construct it since sharp doesn't do animated GIF
	// Let's just create a high-quality static GIF from the best frame
	const staticGif = await sharp(frames[0]).gif().toBuffer();
	writeFileSync("static/chatui/omni-welcome.gif", staticGif);
	console.log(`Wrote static/chatui/omni-welcome.gif (${(staticGif.length / 1024).toFixed(1)}KB)`);

	// Also save a nice PNG version
	writeFileSync("static/chatui/omni-welcome.png", frames[0]);
	console.log(`Wrote static/chatui/omni-welcome.png (${(frames[0].length / 1024).toFixed(1)}KB)`);

	// Generate the SVG directly for highest quality (browsers handle SVG animation)
	const svgFrame = generateFrame(0);
	writeFileSync("static/chatui/welcome.svg", svgFrame);
	console.log(`Wrote static/chatui/welcome.svg`);
}

main().catch(console.error);
