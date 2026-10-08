import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToSVG } from "@iconify/utils";
import { type Mode, iconSvg, pixelSvg } from "../src/index.ts";

const GRID = 16;
const BLOB = 0.55;
const SPARSE = 6;

const ink = Number(process.argv.find((a) => a.startsWith("--ink="))?.slice(6) ?? 100);
const require = createRequire(import.meta.url);

interface Set {
	prefix: string;
	label: string;
	keep: (name: string) => boolean;
}

const SETS: Set[] = [
	{ prefix: "lucide", label: "Lucide", keep: () => true },
	{ prefix: "tabler", label: "Tabler (outline)", keep: (n) => !n.endsWith("-filled") },
	{
		prefix: "ph",
		label: "Phosphor (regular)",
		keep: (n) => !/-(bold|fill|thin|light|duotone)$/.test(n),
	},
];

type Flag = "empty" | "blob" | "sparse";

const flagFor = (count: number): Flag | undefined => {
	if (count === 0) return "empty";
	if (count < SPARSE) return "sparse";
	if (count > GRID * GRID * BLOB) return "blob";
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--muted:#77756f;--line:#e4e2dc;--card:#fff;--flag:#c2410c;--sprite:#1d1d1b}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--muted:#9a978f;--line:#2c2b29;--card:#1c1c1a;--flag:#fb923c;--sprite:#ecebe6}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:18px;margin:0 0 8px}a{color:inherit}
.stats{color:var(--muted);margin-bottom:16px;display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.cell{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:6px}
.cell[data-flag]{border-color:var(--flag)}
.pair{display:flex;gap:10px;align-items:center;color:var(--fg)}
.pair svg.src{width:32px;height:32px}.pair svg.px{width:48px;height:48px;fill:var(--sprite)}
.name{font-size:10px;color:var(--muted);text-align:center;word-break:break-all}
.tag{font-size:10px;color:var(--flag)}
body.only-flagged .cell:not([data-flag]){display:none}
table{border-collapse:collapse}td,th{padding:6px 12px;border-bottom:1px solid var(--line);text-align:right}td:first-child,th:first-child{text-align:left}
</style></head><body>${body}</body></html>`;

const summaries: string[] = [];
mkdirSync("out", { recursive: true });

for (const set of SETS) {
	const json: IconifyJSON = JSON.parse(
		readFileSync(require.resolve(`@iconify-json/${set.prefix}/icons.json`), "utf8"),
	);
	const names = Object.keys(json.icons).filter(set.keep).sort();
	const counts: Record<Flag, number> = { empty: 0, sparse: 0, blob: 0 };
	const modes: Record<Mode, number> = { stroke: 0, fill: 0 };
	const cells: string[] = [];

	for (const name of names) {
		const data = getIconData(json, name);
		if (!data) continue;
		const { attributes, body } = iconToSVG(data);
		const { d, mode } = pixelSvg(iconSvg(`${set.prefix}:${name}`, json), { ink });
		const count = [...d.matchAll(/h(\d+)/g)].reduce((n, [, w]) => n + Number(w), 0);
		modes[mode]++;
		const flag = flagFor(count);
		if (flag) counts[flag]++;
		cells.push(
			`<div class="cell"${flag ? ` data-flag="${flag}"` : ""}><div class="pair">` +
				`<svg class="src" viewBox="${attributes.viewBox}">${body}</svg>` +
				`<svg class="px" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><path d="${d}"/></svg>` +
				`</div><div class="name">${escape(name)}</div>${flag ? `<div class="tag">${flag}</div>` : ""}</div>`,
		);
	}

	const total = cells.length;
	const flagged = counts.empty + counts.sparse + counts.blob;
	const pct = ((1 - flagged / total) * 100).toFixed(1);
	writeFileSync(
		`out/${set.prefix}.html`,
		page(
			`${set.label} pixel sheet`,
			`<h1>${set.label} → ${GRID}×${GRID}</h1>
<div class="stats"><a href="index.html">← all sets</a><span>${total} icons</span><span>mode: ${modes.stroke} stroke, ${modes.fill} fill</span>
<span>empty ${counts.empty}</span><span>sparse ${counts.sparse}</span><span>blob ${counts.blob}</span><span>unflagged ${pct}%</span><span>ink ${ink}</span>
<label><input type="checkbox" onchange="document.body.classList.toggle('only-flagged',this.checked)"> flagged only</label></div>
<div class="grid">${cells.join("")}</div>`,
		),
	);
	summaries.push(
		`<tr><td><a href="${set.prefix}.html">${set.label}</a></td><td>${total}</td><td>${modes.stroke}/${modes.fill}</td><td>${counts.empty}</td><td>${counts.sparse}</td><td>${counts.blob}</td><td>${pct}%</td></tr>`,
	);
	console.log(`${set.label.padEnd(20)} ${total} icons, flagged ${flagged} (empty ${counts.empty}, sparse ${counts.sparse}, blob ${counts.blob}), unflagged ${pct}%`);
}

writeFileSync(
	"out/index.html",
	page(
		"Pixel icon sheets",
		`<h1>Pixel icon sheets</h1><p class="stats">Automatic flags only catch obvious failures; judge recognisability by eye. ink ${ink}.</p>
<table><tr><th>Set</th><th>Icons</th><th>Stroke/fill</th><th>Empty</th><th>Sparse</th><th>Blob</th><th>Unflagged</th></tr>${summaries.join("")}</table>`,
	),
);
