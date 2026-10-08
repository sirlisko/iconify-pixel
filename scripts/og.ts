import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { IconifyJSON } from "@iconify/types";
import { Resvg } from "@resvg/resvg-js";
import { iconSvg, pixelSvg } from "../src/index.ts";

const W = 1200;
const H = 630;
const PAD = 80;
const BG = "#f6f5f0";
const FG = "#1b1b19";
const MUTED = "#6f6c64";
const ACCENT = "#d9480f";

const ICONS = [
	"lucide:heart",
	"lucide:sword",
	"lucide:skull",
	"tabler:mushroom",
	"tabler:pacman",
	"lucide:ghost",
	"lucide:crown",
	"lucide:gem",
	"lucide:castle",
	"lucide:cat",
];
const ICON_GRID = 16;
const ICON_SCALE = 5;

// 5×9 lowercase glyphs: two ascender rows, five x-height rows, two descender rows.
const GLYPHS: Record<string, string[]> = {
	p: ["", "", "####", "#   #", "#   #", "#   #", "####", "#", "#"],
	i: ["  #", "", " ##", "  #", "  #", "  #", " ###"],
	x: ["", "", "#   #", " # #", "  #", " # #", "#   #"],
	e: ["", "", " ###", "#   #", "#####", "#", " ####"],
	l: [" ##", "  #", "  #", "  #", "  #", "  #", " ###"],
	c: ["", "", " ####", "#", "#", "#", " ####"],
	o: ["", "", " ###", "#   #", "#   #", "#   #", " ###"],
	n: ["", "", "####", "#   #", "#   #", "#   #", "#   #"],
	s: ["", "", " ####", "#", " ###", "    #", "####"],
};

const pixelText = (text: string) => {
	let d = "";
	[...text].forEach((ch, i) => {
		GLYPHS[ch]?.forEach((row, y) => {
			for (let x = 0; x < row.length; x++) if (row[x] === "#") d += `M${i * 6 + x} ${y}h1v1h-1z`;
		});
	});
	return d;
};

const require = createRequire(import.meta.url);
const collections: Record<string, IconifyJSON> = {};
const collection = (prefix: string) =>
	(collections[prefix] ??= JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), "utf8")));

const iconSize = ICON_GRID * ICON_SCALE;
const gap = (W - 2 * PAD - ICONS.length * iconSize) / (ICONS.length - 1);
const icons = ICONS.map((name, i) => {
	const { d } = pixelSvg(iconSvg(name, collection(name.split(":")[0])), { grid: ICON_GRID });
	const fill = i === 0 ? ACCENT : FG;
	return `<g transform="translate(${PAD + i * (iconSize + gap)} 430) scale(${ICON_SCALE})" fill="${fill}"><path d="${d}"/></g>`;
}).join("");

const TITLE_SCALE = 14;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
<rect width="${W}" height="${H}" fill="${BG}"/>
<g transform="translate(${PAD} ${PAD}) scale(${TITLE_SCALE})" fill="${ACCENT}"><path d="${pixelText("pixelicons")}"/></g>
<g font-family="Menlo, monospace" font-size="34" fill="${FG}">
<text x="${PAD}" y="290">Any Iconify icon, redrawn as pixel art.</text>
<text x="${PAD}" y="340" fill="${MUTED}" font-size="26">Tune the grid, edit pixels, export SVG, sprite or PNG.</text>
</g>
${icons}
<text x="${PAD}" y="${H - 48}" font-family="Menlo, monospace" font-size="22" fill="${MUTED}">pixelicons.sirlisko.com</text>
</svg>`;

const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "Menlo" } }).render().asPng();
mkdirSync("demo/public", { recursive: true });
writeFileSync("demo/public/og.png", png);
console.log(`demo/public/og.png ${png.length} bytes`);
