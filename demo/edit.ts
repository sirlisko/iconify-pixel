import { type Layer, type PixelResult, palette, runsToPath } from "../src/core.ts";

/** Pixel index → palette index, or ERASE. Kept as a diff so edits survive ink/supersample tweaks. */
export type Edits = Map<number, number>;

export const ERASE = -1;

/** The colours an icon can be painted with: its own palette, or just currentColor for single-colour icons. */
export const swatches = (svg: string, base: PixelResult) =>
	// Capped so each colour fits one base-36 character in the URL.
	base.layers ? palette(svg).map((s) => s.fill).slice(0, 36) : ["currentColor"];

/** Fill per pixel, or null where the sprite is empty. */
export const toCells = (result: PixelResult, grid: number) => {
	const cells: (string | null)[] = Array(grid * grid).fill(null);
	for (const { fill, d } of result.layers ?? [{ fill: "currentColor", d: result.d }]) {
		for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
			for (let i = 0; i < Number(w); i++) cells[Number(y) * grid + Number(x) + i] = fill;
		}
	}
	return cells;
};

export const fromCells = (cells: (string | null)[], grid: number, mode: PixelResult["mode"]): PixelResult => {
	const mask = (keep: (fill: string | null) => boolean) => Uint8Array.from(cells, (c) => (keep(c) ? 255 : 0));
	const d = runsToPath(mask((c) => c !== null), grid, 1);
	const fills = [...new Set(cells.filter((c): c is string => c !== null))];
	if (mode !== "color" && fills.every((f) => f === "currentColor")) return { d, mode };
	const layers: Layer[] = fills.map((fill) => ({ fill, d: runsToPath(mask((c) => c === fill), grid, 1) }));
	return { d, mode: "color", layers };
};

export const applyEdits = (base: PixelResult, edits: Edits | undefined, colors: string[], grid: number) => {
	if (!edits?.size) return base;
	const cells = toCells(base, grid);
	for (const [i, color] of edits) {
		if (i < cells.length) cells[i] = color === ERASE ? null : (colors[color] ?? null);
	}
	return fromCells(cells, grid, base.mode);
};

// Each change is the pixel index in base 36 (2 chars covers a 36×36 grid) plus the palette index, or "-" to erase.
const encodeEdits = (edits: Edits) =>
	[...edits]
		.map(([i, c]) => `${i.toString(36).padStart(2, "0")}${c === ERASE ? "-" : c.toString(36)}`)
		.join("");

const decodeEdits = (text: string): Edits => {
	const edits: Edits = new Map();
	for (const [, i, c] of text.matchAll(/([0-9a-z]{2})([0-9a-z-])/g)) {
		edits.set(Number.parseInt(i, 36), c === "-" ? ERASE : Number.parseInt(c, 36));
	}
	return edits;
};

export const editKey = (id: string, grid: number) => `${id}~${grid}`;

/** `id~grid~changes` entries joined by "." (ids may contain ":" and "-"). */
export const encodeStore = (store: Map<string, Edits>, keep: (key: string) => boolean) =>
	[...store]
		.filter(([key, edits]) => edits.size && keep(key))
		.map(([key, edits]) => `${key}~${encodeEdits(edits)}`)
		.join(".");

export const decodeStore = (text: string) => {
	const store = new Map<string, Edits>();
	for (const entry of text.split(".")) {
		const [id, grid, changes] = entry.split("~");
		if (id && grid && changes) store.set(editKey(id, Number(grid)), decodeEdits(changes));
	}
	return store;
};
