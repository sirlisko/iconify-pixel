import { describe, expect, test } from "vitest";
import { applyEdits, decodeStore, ERASE, type Edits, editKey, encodeStore, fromCells, swatches, toCells } from "../demo/edit.ts";
import { pixelSvg } from "../src/index.ts";

const mono = pixelSvg(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect x="1" y="1" width="2" height="2"/></svg>`,
	{ grid: 4 },
);
const flagSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="2" height="4" fill="#e63946"/><rect x="2" width="2" height="4" fill="#1d3557"/></svg>`;
const flag = pixelSvg(flagSvg, { grid: 4 });

describe("cells", () => {
	test("round-trip a single-colour sprite", () => {
		const cells = toCells(mono, 4);

		expect(cells.filter(Boolean)).toHaveLength(4);
		expect(fromCells(cells, 4, mono.mode)).toEqual(mono);
	});

	test("round-trip colour layers", () => {
		expect(fromCells(toCells(flag, 4), 4, flag.mode)).toEqual(flag);
	});
});

describe("applyEdits", () => {
	test("paints and erases pixels", () => {
		const edits: Edits = new Map([
			[0, 0],
			[5, ERASE],
		]);

		expect(applyEdits(mono, edits, ["currentColor"], 4)).toEqual({
			d: "M0 0h1v1h-1zM2 1h1v1h-1zM1 2h2v1h-2z",
			mode: mono.mode,
		});
	});

	test("recolours a pixel with another palette colour", () => {
		const colors = swatches(flagSvg, flag);
		const edited = applyEdits(flag, new Map([[0, 1]]), colors, 4);

		expect(colors).toEqual(["#e63946", "#1d3557"]);
		expect(edited.layers?.find((l) => l.fill === "#1d3557")?.d).toContain("M0 0h1");
	});

	test("leaves the sprite alone without edits", () => {
		expect(applyEdits(mono, new Map(), ["currentColor"], 4)).toBe(mono);
	});
});

test("edit store survives the URL", () => {
	const store = new Map<string, Edits>([
		[editKey("lucide:mail", 16), new Map([[0, 0], [255, ERASE]])],
		[editKey("twemoji:rocket", 32), new Map([[1023, 3]])],
		[editKey("pasted", 16), new Map([[1, 0]])],
	]);
	const text = encodeStore(store, (key) => key.includes(":"));

	expect(text).not.toContain("pasted");
	expect(decodeStore(text)).toEqual(new Map([...store].filter(([key]) => key.includes(":"))));
});
