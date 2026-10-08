import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToHTML, iconToSVG } from "@iconify/utils";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { createPixelSvg, type PixelResult, toSvg } from "../src/core.ts";

const API = "https://api.iconify.design";
const PAGE = 96;
const DEFAULTS = { set: "lucide", query: "", page: 0, grid: 16, ink: 100, ss: 12 };

type State = typeof DEFAULTS;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
	set: $<HTMLSelectElement>("set"),
	query: $<HTMLInputElement>("query"),
	grid: $<HTMLInputElement>("grid"),
	ink: $<HTMLInputElement>("ink"),
	ss: $<HTMLInputElement>("ss"),
	icons: $("icons"),
	status: $("status"),
	pager: $("pager"),
	page: $("page"),
	prev: $<HTMLButtonElement>("prev"),
	next: $<HTMLButtonElement>("next"),
	svgInput: $<HTMLTextAreaElement>("svg-input"),
	customOut: $("custom-out"),
	detail: $<HTMLDialogElement>("detail"),
};

const readHash = (): State => {
	const p = new URLSearchParams(location.hash.slice(1));
	const num = (k: keyof State) => (p.has(k) ? Number(p.get(k)) : (DEFAULTS[k] as number));
	return {
		set: p.get("set") ?? DEFAULTS.set,
		query: p.get("q") ?? "",
		page: num("page"),
		grid: num("grid"),
		ink: num("ink"),
		ss: num("ss"),
	};
};

let state = readHash();

const writeHash = () => {
	const p = new URLSearchParams();
	if (state.query) p.set("q", state.query);
	else p.set("set", state.set);
	if (state.page) p.set("page", String(state.page));
	for (const k of ["grid", "ink", "ss"] as const) {
		if (state[k] !== DEFAULTS[k]) p.set(k, String(state[k]));
	}
	history.replaceState(null, "", `#${p}`);
};

const getJson = async <T>(url: string): Promise<T> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
};

await initWasm(fetch(wasmUrl));

const pixelSvg = createPixelSvg((svg, size) => {
	const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size }, font: { loadSystemFonts: false } });
	const image = resvg.render();
	const out = { pixels: image.pixels, height: image.height };
	image.free();
	resvg.free();
	return out;
});

const svgs = new Map<string, string>();
const names = new Map<string, string[]>();
let list: string[] = [];

const fetchIcons = async (ids: string[]) => {
	const byPrefix = new Map<string, string[]>();
	for (const id of ids) {
		if (svgs.has(id)) continue;
		const [prefix, name] = id.split(":");
		byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
	}
	const requests = [...byPrefix].flatMap(([prefix, wanted]) =>
		Array.from({ length: Math.ceil(wanted.length / 80) }, (_, i) =>
			getJson<IconifyJSON>(`${API}/${prefix}.json?icons=${wanted.slice(i * 80, i * 80 + 80).join(",")}`).then((json) => {
				for (const name of wanted) {
					const data = getIconData(json, name);
					if (!data) continue;
					const { attributes, body } = iconToSVG(data);
					svgs.set(`${prefix}:${name}`, iconToHTML(body, attributes));
				}
			}),
		),
	);
	await Promise.all(requests);
};

const loadSet = async (prefix: string) => {
	const cached = names.get(prefix);
	if (cached) return cached;
	const info = await getJson<{ uncategorized?: string[]; categories?: Record<string, string[]> }>(
		`${API}/collection?prefix=${prefix}`,
	);
	const all = [...new Set([...(info.uncategorized ?? []), ...Object.values(info.categories ?? {}).flat()])].sort();
	const ids = all.map((n) => `${prefix}:${n}`);
	names.set(prefix, ids);
	return ids;
};

const sprite = (svg: string): PixelResult | undefined => {
	try {
		return pixelSvg(svg, { grid: state.grid, ink: state.ink, supersample: state.ss });
	} catch {
		return undefined;
	}
};

const cell = (id: string, svg: string) => {
	const result = sprite(svg);
	const button = document.createElement("button");
	button.type = "button";
	button.className = "cell";
	button.title = id;
	if (result?.mode === "fill") button.dataset.mode = "fill";
	button.style.setProperty("--size", `${state.grid * Math.max(1, Math.round(48 / state.grid))}px`);
	button.innerHTML = `<div class="pair"><div class="src">${svg}</div><div class="px">${result ? toSvg(result.d, state.grid) : "⚠"}</div></div><div class="name">${id}</div>${result?.mode === "fill" ? '<div class="tag">fill</div>' : ""}`;
	button.addEventListener("click", () => openDetail(id, svg));
	return button;
};

const pageIds = () => list.slice(state.page * PAGE, (state.page + 1) * PAGE);

const draw = () => {
	const ids = pageIds();
	el.icons.replaceChildren(...ids.filter((id) => svgs.has(id)).map((id) => cell(id, svgs.get(id) as string)));
	const pages = Math.max(1, Math.ceil(list.length / PAGE));
	el.pager.hidden = pages <= 1;
	el.page.textContent = `${state.page + 1} / ${pages}`;
	el.prev.disabled = state.page === 0;
	el.next.disabled = state.page >= pages - 1;
	drawCustom();
};

let token = 0;
const load = async () => {
	const mine = ++token;
	writeHash();
	try {
		el.status.textContent = "Loading…";
		if (state.query) {
			const res = await getJson<{ icons: string[] }>(`${API}/search?query=${encodeURIComponent(state.query)}&limit=480`);
			list = res.icons;
		} else {
			list = await loadSet(state.set);
		}
		if (mine !== token) return;
		state.page = Math.min(state.page, Math.max(0, Math.ceil(list.length / PAGE) - 1));
		await fetchIcons(pageIds());
		if (mine !== token) return;
		el.status.textContent = state.query
			? `${list.length} results for “${state.query}”`
			: `${list.length} icons in ${el.set.selectedOptions[0]?.text ?? state.set}`;
		draw();
	} catch (e) {
		if (mine === token) el.status.textContent = `Couldn't load icons: ${(e as Error).message}`;
	}
};

let frame = 0;
const redraw = () => {
	cancelAnimationFrame(frame);
	frame = requestAnimationFrame(() => {
		writeHash();
		draw();
		if (el.detail.open && current) openDetail(...current);
	});
};

const syncControls = () => {
	for (const k of ["grid", "ink", "ss"] as const) {
		el[k].value = String(state[k]);
		$(`${k}-out`).textContent = String(state[k]);
	}
	el.query.value = state.query;
};

for (const k of ["grid", "ink", "ss"] as const) {
	el[k].addEventListener("input", () => {
		state[k] = Number(el[k].value);
		$(`${k}-out`).textContent = el[k].value;
		redraw();
	});
}

$("reset").addEventListener("click", () => {
	Object.assign(state, { grid: DEFAULTS.grid, ink: DEFAULTS.ink, ss: DEFAULTS.ss });
	syncControls();
	redraw();
});

el.set.addEventListener("change", () => {
	state = { ...state, set: el.set.value, query: "", page: 0 };
	el.query.value = "";
	load();
});

let searchTimer = 0;
el.query.addEventListener("input", () => {
	clearTimeout(searchTimer);
	searchTimer = window.setTimeout(() => {
		state = { ...state, query: el.query.value.trim(), page: 0 };
		load();
	}, 300);
});

const turn = (delta: number) => {
	state.page += delta;
	load();
	scrollTo({ top: 0 });
};
el.prev.addEventListener("click", () => turn(-1));
el.next.addEventListener("click", () => turn(1));

const drawCustom = () => {
	const svg = el.svgInput.value.trim();
	el.customOut.replaceChildren(...(svg.startsWith("<svg") ? [cell("custom", svg)] : []));
};
el.svgInput.addEventListener("input", drawCustom);

let current: [string, string] | undefined;
const openDetail = (id: string, svg: string) => {
	current = [id, svg];
	const result = sprite(svg);
	const d = result?.d ?? "";
	const out = toSvg(d, state.grid);
	$("detail-name").textContent = `${id}${result?.mode === "fill" ? " · fill mode" : ""}`;
	for (const box of ["detail-src", "detail-px", "detail-overlay"]) $(box).style.setProperty("--grid", String(state.grid));
	$("detail-src").innerHTML = svg;
	$("detail-px").innerHTML = out;
	$("detail-overlay").innerHTML = `<div class="px-layer">${out}</div><div class="src-layer">${svg}</div>`;
	$("detail-scales").innerHTML = [1, 2, 3, 4]
		.map((n) => `<div>${out.replace("<svg ", `<svg width="${state.grid * n}" height="${state.grid * n}" `)}<span>${n}×</span></div>`)
		.join("");
	$("detail-code").textContent = d;
	if (!el.detail.open) el.detail.showModal();
};

const copy = async (button: HTMLElement, text: () => string) => {
	await navigator.clipboard.writeText(text());
	const label = button.textContent;
	button.textContent = "Copied";
	setTimeout(() => (button.textContent = label), 1200);
};
$("copy-svg").addEventListener("click", (e) =>
	copy(e.currentTarget as HTMLElement, () => toSvg($("detail-code").textContent ?? "", state.grid)),
);
$("copy-d").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, () => $("detail-code").textContent ?? ""));

const collections = await getJson<Record<string, { name: string; total: number; hidden?: boolean }>>(`${API}/collections`);
el.set.replaceChildren(
	...Object.entries(collections)
		.filter(([, c]) => !c.hidden)
		.sort(([, a], [, b]) => a.name.localeCompare(b.name))
		.map(([prefix, c]) => new Option(`${c.name} (${c.total})`, prefix, false, prefix === state.set)),
);

addEventListener("hashchange", () => {
	state = readHash();
	el.set.value = state.set;
	syncControls();
	load();
});

syncControls();
load();
