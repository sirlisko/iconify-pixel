export interface PixelOptions {
	/** Sprite size in pixels. */
	grid?: number;
	/** Alpha (0–255) a pixel needs to be inked; lower fills in curves, higher breaks diagonals. */
	ink?: number;
	/** Width of the icon's coordinate space, read from its viewBox when omitted. */
	viewBox?: number;
	/** Subpixels sampled per sprite pixel, along each axis. */
	supersample?: number;
}

export type Mode = "stroke" | "fill";

export interface PixelResult {
	/** One path for the inked pixels, a rectangle per horizontal run. */
	d: string;
	/** "fill" when the icon has no strokes to snap to the grid, so quality is lower. */
	mode: Mode;
}

/** Rasterises an SVG to `size` pixels wide, returning RGBA pixels. */
export type Render = (svg: string, size: number) => { pixels: Uint8Array; height: number };

export const runsToPath = (alpha: Uint8Array, size = 16, ink = 100) => {
	const inked = (i: number) => (alpha[i] ?? 0) >= ink;
	let d = "";
	for (let y = 0; y < size; y++) {
		let x = 0;
		while (x < size) {
			if (!inked(y * size + x)) {
				x++;
				continue;
			}
			const start = x;
			while (x < size && inked(y * size + x)) x++;
			d += `M${start} ${y}h${x - start}v1h${start - x}z`;
		}
	}
	return d;
};

export const toSvg = (d: string, grid = 16) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" fill="currentColor" shape-rendering="crispEdges"><path d="${d}"/></svg>`;

const viewBoxWidth = (svg: string) => {
	const m = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)/);
	return m ? Number(m[1]) : 24;
};

// One pixel of the grid, so strokes land on whole pixels instead of smearing across two.
const forceStroke = (svg: string, width: number) =>
	svg
		.replace(/stroke-width="[^"]*"/g, `stroke-width="${width}"`)
		.replace(/<svg\b/, `<svg stroke-width="${width}"`)
		.replace(/stroke-linecap="[^"]*"/g, 'stroke-linecap="square"')
		.replace(/stroke-linejoin="[^"]*"/g, 'stroke-linejoin="miter"');

export const prepare = (svg: string, grid: number, viewBox?: number) => {
	const mode: Mode = /stroke="(?!none)/.test(svg) ? "stroke" : "fill";
	const black = svg.replace(/currentColor/g, "#000");
	return {
		mode,
		svg: mode === "stroke" ? forceStroke(black, (viewBox ?? viewBoxWidth(svg)) / grid) : black,
	};
};

/** Averages each supersample block's alpha into one sprite pixel. */
export const downsample = (pixels: Uint8Array, height: number, grid: number, supersample: number) => {
	const px = grid * supersample;
	const rows = Math.min(px, height);
	const alpha = new Uint8Array(grid * grid);
	const area = supersample * supersample;
	for (let gy = 0; gy < grid; gy++) {
		for (let gx = 0; gx < grid; gx++) {
			let sum = 0;
			for (let y = 0; y < supersample; y++) {
				const sy = gy * supersample + y;
				if (sy >= rows) break;
				const row = sy * px;
				for (let x = 0; x < supersample; x++) {
					sum += pixels[(row + gx * supersample + x) * 4 + 3];
				}
			}
			alpha[gy * grid + gx] = Math.round(sum / area);
		}
	}
	return alpha;
};

export const createPixelSvg =
	(render: Render) =>
	(svg: string, opts: PixelOptions = {}): PixelResult => {
		const { grid = 16, ink = 100, supersample = 12 } = opts;
		const prepared = prepare(svg, grid, opts.viewBox);
		const { pixels, height } = render(prepared.svg, grid * supersample);
		return {
			d: runsToPath(downsample(pixels, height, grid, supersample), grid, ink),
			mode: prepared.mode,
		};
	};
