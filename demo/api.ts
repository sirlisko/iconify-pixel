import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToHTML, iconToSVG } from "@iconify/utils";

const API = "https://api.iconify.design";

export interface Collection {
	name: string;
	total: number;
	hidden?: boolean;
	palette?: boolean;
}

export interface SetInfo {
	ids: string[];
	/** Style variants as name suffix (e.g. "-bold") or prefix (e.g. "outline-") → label. "" is the base style. */
	themes?: { kind: "suffix" | "prefix"; labels: Record<string, string> };
	categories?: Record<string, string[]>;
}

const getJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
};

export const collections = () => getJson<Record<string, Collection>>(`${API}/collections`);

const sets = new Map<string, Promise<SetInfo>>();

export const setInfo = (prefix: string) => {
	const cached = sets.get(prefix);
	if (cached) return cached;
	const info = getJson<{
		uncategorized?: string[];
		categories?: Record<string, string[]>;
		suffixes?: Record<string, string>;
		prefixes?: Record<string, string>;
	}>(`${API}/collection?prefix=${prefix}`).then((raw) => {
		const names = [...new Set([...(raw.uncategorized ?? []), ...Object.values(raw.categories ?? {}).flat()])].sort();
		const themes = raw.suffixes
			? { kind: "suffix" as const, labels: raw.suffixes }
			: raw.prefixes
				? { kind: "prefix" as const, labels: raw.prefixes }
				: undefined;
		return {
			ids: names.map((n) => `${prefix}:${n}`),
			themes,
			categories: raw.categories && Object.keys(raw.categories).length ? raw.categories : undefined,
		};
	});
	sets.set(prefix, info);
	info.catch(() => sets.delete(prefix));
	return info;
};

export const search = async (query: string, prefix?: string) => {
	const params = new URLSearchParams({ query, limit: "999" });
	if (prefix) params.set("prefix", prefix);
	return (await getJson<{ icons: string[] }>(`${API}/search?${params}`)).icons;
};

/** The style an icon belongs to, as the key used in `SetInfo.themes.labels`. */
export const themeOf = (id: string, themes: NonNullable<SetInfo["themes"]>) => {
	const name = id.slice(id.indexOf(":") + 1);
	// Longest first, so "outline-rounded" wins over "rounded".
	const keys = Object.keys(themes.labels)
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);
	const match = keys.find((k) => (themes.kind === "suffix" ? name.endsWith(`-${k}`) : name.startsWith(`${k}-`)));
	return match ?? "";
};

const svgs = new Map<string, string>();

export const svgOf = (id: string) => svgs.get(id);

/** Fetches the SVG for every id not loaded yet, batched per set. */
export const loadIcons = async (ids: string[]) => {
	const byPrefix = new Map<string, string[]>();
	for (const id of ids) {
		if (svgs.has(id)) continue;
		const [prefix, name] = id.split(":");
		if (!prefix || !name) continue;
		byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
	}
	await Promise.all(
		[...byPrefix].flatMap(([prefix, wanted]) =>
			Array.from({ length: Math.ceil(wanted.length / 80) }, async (_, i) => {
				const batch = wanted.slice(i * 80, i * 80 + 80);
				const json = await getJson<IconifyJSON>(`${API}/${prefix}.json?icons=${batch.join(",")}`);
				for (const name of batch) {
					const data = getIconData(json, name);
					if (!data) continue;
					const { attributes, body } = iconToSVG(data);
					svgs.set(`${prefix}:${name}`, iconToHTML(body, attributes));
				}
			}),
		),
	);
};
