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

export type Mode = "stroke" | "fill" | "color";

export interface Layer {
	fill: string;
	d: string;
}

export interface PixelResult {
	/** One path for the inked pixels, a rectangle per horizontal run. */
	d: string;
	/** "fill" when the icon has no strokes to snap to the grid, so quality is lower; "color" when it paints with fixed colours. */
	mode: Mode;
	/** For icons with fixed colours, `d` split into one path per palette colour. */
	layers?: Layer[];
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

export const toSvg = (sprite: string | PixelResult, grid = 16) => {
	const paths =
		typeof sprite === "string"
			? `<path d="${sprite}"/>`
			: sprite.layers
				? sprite.layers.map(({ fill, d }) => `<path fill="${fill}" d="${d}"/>`).join("")
				: `<path d="${sprite.d}"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" fill="currentColor" shape-rendering="crispEdges">${paths}</svg>`;
};

type Rgb = [number, number, number];

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

const parseColor = (value: string): Rgb | undefined => {
	const v = value.trim().toLowerCase();
	const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
	if (short) return [short[1], short[2], short[3]].map((c) => Number.parseInt(c + c, 16)) as Rgb;
	const long = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
	if (long) return [long[1], long[2], long[3]].map((c) => Number.parseInt(c, 16)) as Rgb;
	const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	if (v === "black") return [0, 0, 0];
	if (v === "white") return [255, 255, 255];
};

interface Swatch {
	fill: string;
	rgb: Rgb;
}

/** Distinct colours the SVG paints with, gradient stops included. */
export const palette = (svg: string): Swatch[] => {
	const found = new Map<string, Swatch>();
	for (const [, value] of svg.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?([^"';>]+)/g)) {
		if (value.trim() === "currentColor") {
			found.set("currentColor", { fill: "currentColor", rgb: [0, 0, 0] });
			continue;
		}
		const rgb = parseColor(value);
		if (rgb) found.set(hex(rgb), { fill: hex(rgb), rgb });
	}
	return [...found.values()];
};

/** Paints each inked pixel with the palette colour most of its opaque subpixels snap to. */
export const colorLayers = (
	pixels: Uint8Array,
	height: number,
	grid: number,
	supersample: number,
	alpha: Uint8Array,
	ink: number,
	colors: Swatch[],
): Layer[] => {
	const px = grid * supersample;
	const rows = Math.min(px, height);
	const masks = colors.map(() => new Uint8Array(grid * grid));
	const votes = new Uint32Array(colors.length);
	const nearest = (r: number, g: number, b: number) => {
		let best = 0;
		let bestDist = Number.POSITIVE_INFINITY;
		colors.forEach(({ rgb: [cr, cg, cb] }, i) => {
			const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		});
		return best;
	};
	for (let gy = 0; gy < grid; gy++) {
		for (let gx = 0; gx < grid; gx++) {
			const cell = gy * grid + gx;
			if (alpha[cell] < ink) continue;
			votes.fill(0);
			for (let y = 0; y < supersample; y++) {
				const sy = gy * supersample + y;
				if (sy >= rows) break;
				for (let x = 0; x < supersample; x++) {
					const i = (sy * px + gx * supersample + x) * 4;
					const a = pixels[i + 3];
					// Edge subpixels blend with the background and would vote for the wrong colour.
					if (a < 128) continue;
					const scale = 255 / a;
					votes[nearest(pixels[i] * scale, pixels[i + 1] * scale, pixels[i + 2] * scale)]++;
				}
			}
			let winner = 0;
			for (let i = 1; i < votes.length; i++) if (votes[i] > votes[winner]) winner = i;
			masks[winner][cell] = 255;
		}
	}
	return colors
		.map(({ fill }, i) => ({ fill, d: runsToPath(masks[i], grid, 1) }))
		.filter((layer) => layer.d);
};

const rootTag = (svg: string) => svg.match(/<svg\b[^>]*>/)?.[0] ?? "";

const viewBoxWidth = (svg: string) => {
	const root = rootTag(svg);
	const box = root.match(/viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)/);
	if (box) return Number(box[1]);
	const width = root.match(/\swidth="([\d.]+)(?:px)?"/);
	return width ? Number(width[1]) : 24;
};

/** Trims anything before the root element (XML prolog, comments) and adds the namespace resvg requires. */
const normalize = (svg: string) => {
	const start = svg.search(/<svg\b/);
	const trimmed = start > 0 ? svg.slice(start) : svg;
	return /<svg\b[^>]*\sxmlns=/.test(trimmed)
		? trimmed
		: trimmed.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
};

// One pixel of the grid, so strokes land on whole pixels instead of smearing across two.
const forceStroke = (svg: string, width: number) => {
	const snapped = svg
		.replace(/stroke-width="[^"]*"/g, `stroke-width="${width}"`)
		.replace(/stroke-linecap="[^"]*"/g, 'stroke-linecap="square"')
		.replace(/stroke-linejoin="[^"]*"/g, 'stroke-linejoin="miter"');
	// Strokes without their own width inherit the default of 1, so set one on the root unless it has one.
	return /stroke-width=/.test(rootTag(snapped))
		? snapped
		: snapped.replace(/<svg\b/, `<svg stroke-width="${width}"`);
};

export const prepare = (input: string, grid: number, viewBox?: number) => {
	const svg = normalize(input);
	const stroked = /stroke="(?!none)/.test(svg);
	const black = svg.replace(/currentColor/g, "#000");
	const colors = palette(svg);
	// Icons drawn only in currentColor (or plain black, as hand-written SVGs often are) are meant to be
	// recoloured; any other fixed colour is part of the design.
	const fixed = colors.some(({ fill }) => fill !== "currentColor" && fill !== "#000000");
	const mode: Mode = fixed ? "color" : stroked ? "stroke" : "fill";
	return {
		mode,
		colors,
		svg: stroked ? forceStroke(black, (viewBox ?? viewBoxWidth(svg)) / grid) : black,
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
		const alpha = downsample(pixels, height, grid, supersample);
		const d = runsToPath(alpha, grid, ink);
		if (prepared.mode !== "color") return { d, mode: prepared.mode };
		return {
			d,
			mode: "color",
			layers: colorLayers(pixels, height, grid, supersample, alpha, ink, prepared.colors),
		};
	};
