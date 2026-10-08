import { Resvg } from "@resvg/resvg-js";
import { createPixelSvg, downsample, type Render } from "./core.ts";

export * from "./core.ts";

const render: Render = (svg, size) => {
	const image = new Resvg(svg, {
		fitTo: { mode: "width", value: size },
		// Icons have no text, and scanning system fonts dominates render time.
		font: { loadSystemFonts: false },
	}).render();
	return { pixels: image.pixels, height: image.height };
};

export const rasterAlpha = (svg: string, grid: number, supersample: number) => {
	const { pixels, height } = render(svg, grid * supersample);
	return downsample(pixels, height, grid, supersample);
};

export const pixelSvg = createPixelSvg(render);
