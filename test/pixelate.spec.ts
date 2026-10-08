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

	test("splits multicolour icons into a layer per colour", () => {
		const flag = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="8" height="16" fill="#e63946"/><rect x="8" width="8" height="16" fill="#1d3557"/></svg>`;

		const { d, mode, layers } = pixelSvg(flag);
		expect(mode).toBe("color");
		expect(d).toBe(Array.from({ length: 16 }, (_, y) => `M0 ${y}h16v1h-16z`).join(""));
		expect(layers).toEqual([
			{ fill: "#e63946", d: Array.from({ length: 16 }, (_, y) => `M0 ${y}h8v1h-8z`).join("") },
			{ fill: "#1d3557", d: Array.from({ length: 16 }, (_, y) => `M8 ${y}h8v1h-8z`).join("") },
		]);
	});

	test("keeps a single fixed colour", () => {
		const one = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#ffdc5d"/></svg>`;

		expect(pixelSvg(one).layers?.map((l) => l.fill)).toEqual(["#ffdc5d"]);
	});

	test("leaves currentColor and plain black icons recolourable", () => {
		const black = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#000"/></svg>`;

		expect(pixelSvg(black)).not.toHaveProperty("layers");
		expect(pixelIcon("ph:envelope")).not.toHaveProperty("layers");
		expect(pixelIcon("lucide:mail")).not.toHaveProperty("layers");
	});

	test("keeps currentColor as a layer next to fixed colours", () => {
		const mixed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="8" height="16" fill="currentColor"/><rect x="8" width="8" height="16" fill="#e63946"/></svg>`;

		expect(pixelSvg(mixed).layers?.map((l) => l.fill)).toEqual(["currentColor", "#e63946"]);
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

test("toSvg draws each colour layer", () => {
	expect(
		toSvg({ d: "M0 0h2v1h-2z", mode: "color", layers: [
			{ fill: "#f00", d: "M0 0h1v1h-1z" },
			{ fill: "#00f", d: "M1 0h1v1h-1z" },
		] }),
	).toBe(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges"><path fill="#f00" d="M0 0h1v1h-1z"/><path fill="#00f" d="M1 0h1v1h-1z"/></svg>',
	);
});

test("toSvg wraps the path in a crisp, recolourable svg", () => {
	expect(toSvg("M0 0h1v1h-1z")).toBe(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges"><path d="M0 0h1v1h-1z"/></svg>',
	);
});
