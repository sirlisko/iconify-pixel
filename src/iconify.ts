import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToHTML, iconToSVG } from "@iconify/utils";
import { type PixelOptions, type PixelResult, pixelSvg } from "./pixelate.ts";

export interface IconOptions extends PixelOptions {
	/** Icon set data, for when `@iconify-json/<prefix>` can't be resolved, e.g. in a browser. */
	collection?: IconifyJSON;
}

const collections = new Map<string, IconifyJSON>();

// Try the app's node_modules too: strict installs like pnpm hide its deps from this package.
const resolvers = [
	createRequire(import.meta.url),
	createRequire(join(process.cwd(), "noop.js")),
];

const loadCollection = (prefix: string) => {
	const cached = collections.get(prefix);
	if (cached) return cached;
	for (const require of resolvers) {
		try {
			const path = require.resolve(`@iconify-json/${prefix}/icons.json`);
			const json: IconifyJSON = JSON.parse(readFileSync(path, "utf8"));
			collections.set(prefix, json);
			return json;
		} catch {}
	}
	throw new Error(
		`Icon set "${prefix}" not found. Install @iconify-json/${prefix} or pass it as \`collection\`.`,
	);
};

export const iconSvg = (name: string, collection?: IconifyJSON) => {
	const [prefix, icon] = name.split(":");
	if (!prefix || !icon) {
		throw new Error(`Expected "prefix:name", e.g. "lucide:mail", got "${name}".`);
	}
	const data = getIconData(collection ?? loadCollection(prefix), icon);
	if (!data) throw new Error(`Icon "${name}" not found.`);
	const { attributes, body } = iconToSVG(data);
	return iconToHTML(body, { ...attributes, xmlns: "http://www.w3.org/2000/svg" });
};

export const pixelIcon = (name: string, { collection, ...opts }: IconOptions = {}): PixelResult =>
	pixelSvg(iconSvg(name, collection), opts);
