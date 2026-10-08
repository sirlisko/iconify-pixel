import { type IconNode, icons } from "lucide";
import sharp from "sharp";
import { rasterAlpha } from "../src/pixelate.ts";

const GRID = 16;
const SITE_INK = 100;
const NAMES = ["Mail", "Earth", "Atom", "GitBranch", "MapPinHouse"] as const;
const INKS = [64, 80, 100, 112, 128, 144];
const SUPERSAMPLES = [8, 12, 16];

// Copied from sirlisko.com PR #61 so we compare against what ships on the site.
// Strokes are already one pixel wide, so both pipelines rasterise the same SVG.
const toSvg = (node: IconNode) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${node
		.map(
			([tag, attrs]) =>
				`<${tag} ${Object.entries(attrs)
					.map(([k, v]) => `${k}="${v}"`)
					.join(" ")}/>`,
		)
		.join("")}</svg>`;

const sharpMask = async (svg: string) => {
	const alpha = await sharp(Buffer.from(svg), { density: 384 })
		.resize(GRID, GRID, { kernel: "lanczos3" })
		.ensureAlpha()
		.extractChannel(3)
		.raw()
		.toBuffer();
	return [...alpha].map((a) => a >= SITE_INK);
};

const show = (mask: boolean[]) =>
	Array.from({ length: GRID }, (_, y) =>
		mask
			.slice(y * GRID, (y + 1) * GRID)
			.map((b) => (b ? "█" : "·"))
			.join(""),
	);

const svgs = NAMES.map((n) => toSvg(icons[n]));
const reference = await Promise.all(svgs.map(sharpMask));

console.log("pixels differing from the site (sharp, ink 100), summed over 5 icons\n");
console.log(`ss\\ink ${INKS.map((i) => String(i).padStart(5)).join("")}`);
let best = { diff: Infinity, ink: 0, ss: 0 };
for (const ss of SUPERSAMPLES) {
	const row = INKS.map((ink) => {
		const diff = svgs.reduce((total, svg, i) => {
			const alpha = rasterAlpha(svg, GRID, ss);
			return total + [...alpha].filter((a, p) => a >= ink !== reference[i][p]).length;
		}, 0);
		if (diff < best.diff) best = { diff, ink, ss };
		return String(diff).padStart(5);
	});
	console.log(`${String(ss).padStart(6)} ${row.join("")}`);
}
console.log(`\nbest: ink ${best.ink}, supersample ${best.ss} (${best.diff} px)\n`);

NAMES.forEach((name, i) => {
	const alpha = rasterAlpha(svgs[i], GRID, best.ss);
	const ours = show([...alpha].map((a) => a >= best.ink));
	const site = show(reference[i]);
	console.log(`${name.padEnd(16)}site${" ".repeat(13)}resvg`);
	site.forEach((line, y) => console.log(`${" ".repeat(16)}${line} ${ours[y]}`));
	console.log();
});
