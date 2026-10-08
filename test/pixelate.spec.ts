import { describe, expect, test } from "vitest";
import { iconSvg, pixelIcon, pixelSvg, runsToPath, toSvg } from "../src/index.ts";

const extent = (d: string) =>
	[...d.matchAll(/M(\d+) (\d+)h(\d+)/g)].flatMap(([, x, y, w]) => [
		Number(x) + Number(w),
		Number(y) + 1,
	]);

describe("runsToPath", () => {
	test("merges each horizontal run into one rectangle", () => {
		const alpha = new Uint8Array([0, 255, 255, 0, 255, 0, 0, 0, 0]);

		expect(runsToPath(alpha, 3)).toBe("M1 0h2v1h-2zM1 1h1v1h-1z");
	});

	test("leaves faint pixels blank", () => {
		expect(runsToPath(new Uint8Array([40, 60, 99, 0]), 2)).toBe("");
	});
});

describe("pixelSvg", () => {
	test("snaps strokes regardless of the icon's own stroke width", () => {
		const line = (width: string) =>
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 8.5h12" stroke="#000" ${width}/></svg>`;

		const thick = pixelSvg(line('stroke-width="4"'));
		expect(thick.mode).toBe("stroke");
		expect(pixelSvg(line("")).d).toBe(thick.d);
		expect(thick.d.match(/M/g)).toHaveLength(1);
	});

	test("falls back to fill mode for icons without strokes", () => {
		const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8"/></svg>`;

		expect(pixelSvg(square)).toEqual({
			d: Array.from({ length: 8 }, (_, i) => `M4 ${i + 4}h8v1h-8z`).join(""),
			mode: "fill",
		});
	});

	test("scales the grid", () => {
		const { d } = pixelSvg(iconSvg("lucide:mail"), { grid: 32 });

		expect(Math.max(...extent(d))).toBeGreaterThan(16);
		expect(extent(d).every((n) => n <= 32)).toBe(true);
	});

	test("ignores the part of a wide viewBox that falls below the square", () => {
		const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16"><rect width="32" height="16"/></svg>`;

		expect(extent(pixelSvg(wide).d).every((n) => n <= 16)).toBe(true);
	});
});

describe("pixelIcon", () => {
	test("draws a sprite inside the 16 grid", () => {
		const { d, mode } = pixelIcon("lucide:mail");

		expect(mode).toBe("stroke");
		expect(d).not.toBe("");
		expect(extent(d).every((n) => n <= 16)).toBe(true);
	});

	test("works across icon sets", () => {
		expect(pixelIcon("tabler:mail").d).not.toBe("");
		expect(pixelIcon("ph:envelope").mode).toBe("fill");
	});

	test("explains what's missing", () => {
		expect(() => pixelIcon("mail")).toThrow(/prefix:name/);
		expect(() => pixelIcon("nope:mail")).toThrow(/@iconify-json\/nope/);
		expect(() => pixelIcon("lucide:not-an-icon")).toThrow(/not found/);
	});
});

test("toSvg wraps the path in a crisp, recolourable svg", () => {
	expect(toSvg("M0 0h1v1h-1z")).toBe(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges"><path d="M0 0h1v1h-1z"/></svg>',
	);
});
