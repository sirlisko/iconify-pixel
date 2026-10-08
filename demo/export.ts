import { strToU8, zipSync } from "fflate";
import { type PixelResult, toSvg } from "../src/core.ts";

export interface Sprite {
	id: string;
	result: PixelResult;
}

export interface Settings {
	grid: number;
	ink: number;
	supersample: number;
}

const fileName = (id: string) => id.replace(":", "-");

const columnsFor = (count: number) => Math.max(1, Math.ceil(Math.sqrt(count)));

export const download = (name: string, data: BlobPart, type: string) => {
	const url = URL.createObjectURL(new Blob([data], { type }));
	const a = Object.assign(document.createElement("a"), { href: url, download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const svgZip = (sprites: Sprite[], { grid }: Settings) =>
	zipSync(
		Object.fromEntries(sprites.map(({ id, result }) => [`${fileName(id)}.svg`, strToU8(toSvg(result, grid))])),
	);

/** One SVG of `<symbol>`s, used as `<svg><use href="sprite.svg#lucide-mail"/></svg>`. */
export const svgSprite = (sprites: Sprite[], { grid }: Settings) => {
	const symbols = sprites
		.map(({ id, result }) => {
			const inner = toSvg(result, grid).replace(/^<svg[^>]*>|<\/svg>$/g, "");
			return `<symbol id="${fileName(id)}" viewBox="0 0 ${grid} ${grid}" fill="currentColor" shape-rendering="crispEdges">${inner}</symbol>`;
		})
		.join("\n");
	return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols}\n</svg>\n`;
};

/** Paths and, for the PNG sheet, where each sprite sits (in sprite pixels, before scaling). */
export const manifest = (sprites: Sprite[], settings: Settings) => {
	const columns = columnsFor(sprites.length);
	return JSON.stringify(
		{
			...settings,
			columns,
			icons: Object.fromEntries(
				sprites.map(({ id, result }, i) => [
					id,
					{
						x: (i % columns) * settings.grid,
						y: Math.floor(i / columns) * settings.grid,
						...result,
					},
				]),
			),
		},
		null,
		2,
	);
};

/** A sprite sheet laid out like `manifest`, with single-colour icons painted in `ink`. */
export const pngSheet = (sprites: Sprite[], { grid }: Settings, scale: number, ink: string) => {
	const columns = columnsFor(sprites.length);
	const rows = Math.ceil(sprites.length / columns);
	const canvas = Object.assign(document.createElement("canvas"), {
		width: columns * grid * scale,
		height: rows * grid * scale,
	});
	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
	sprites.forEach(({ result }, i) => {
		ctx.setTransform(scale, 0, 0, scale, (i % columns) * grid * scale, Math.floor(i / columns) * grid * scale);
		for (const { fill, d } of result.layers ?? [{ fill: ink, d: result.d }]) {
			ctx.fillStyle = fill === "currentColor" ? ink : fill;
			ctx.fill(new Path2D(d));
		}
	});
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"),
	);
};
