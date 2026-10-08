import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { createPixelSvg, type PixelResult, toSvg } from "../src/core.ts";
import { collections, loadIcons, type SetInfo, search, setInfo, svgOf, themeOf } from "./api.ts";
import { applyEdits, decodeStore, ERASE, type Edits, editKey, encodeStore, swatches, toCells } from "./edit.ts";
import { download, manifest, pngSheet, type Sprite, svgSprite, svgZip } from "./export.ts";

const PAGE = 96;
// Shown on the landing page: outline, filled, emoji and logo sets, mixed so the range shows on the first screen.
const FEATURED = [
	"lucide",
	"twemoji",
	"tabler",
	"fluent-emoji-flat",
	"heroicons",
	"logos",
	"iconoir",
	"flat-color-icons",
	"ph",
	"mdi",
	"material-symbols",
	"mingcute",
];
// Iconify's own samples for these lean on thin weights, which don't survive a 16px grid.
const SAMPLES: Record<string, string[]> = {
	ph: ["house", "heart", "rocket", "camera", "bell", "folder"],
};
const DEFAULTS = { grid: 16, ink: 100, ss: 12 };

interface State {
	set: string;
	style: string;
	category: string;
	query: string;
	page: number;
	view: "browse" | "selection";
	grid: number;
	ink: number;
	ss: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
	set: $<HTMLSelectElement>("set"),
	style: $<HTMLSelectElement>("style"),
	category: $<HTMLSelectElement>("category"),
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
	svgFile: $<HTMLInputElement>("svg-file"),
	customOut: $("custom-out"),
	detail: $<HTMLDialogElement>("detail"),
	tray: $("tray"),
};

const selection: string[] = [];
const edits = new Map<string, Edits>();
// Custom SVGs can't be reloaded from a link, so only Iconify ids ("prefix:name") go in the URL.
const shareable = (key: string) => key.includes(":");

const readHash = (): State => {
	const p = new URLSearchParams(location.hash.slice(1));
	const num = (k: keyof typeof DEFAULTS) => {
		const v = Number(p.get(k));
		return p.has(k) && Number.isFinite(v) ? v : DEFAULTS[k];
	};
	selection.splice(0, selection.length, ...(p.get("sel")?.split(",").filter(Boolean) ?? []));
	for (const key of [...edits.keys()]) if (shareable(key)) edits.delete(key);
	for (const [key, value] of decodeStore(p.get("edit") ?? "")) edits.set(key, value);
	return {
		set: p.get("set") ?? "",
		style: p.get("style") ?? "",
		category: p.get("cat") ?? "",
		query: p.get("q") ?? "",
		page: Math.max(0, Number(p.get("page")) || 0),
		view: p.get("view") === "selection" ? "selection" : "browse",
		grid: num("grid"),
		ink: num("ink"),
		ss: num("ss"),
	};
};

let state = readHash();

const hashFor = (withSelection: boolean) => {
	const p = new URLSearchParams();
	if (state.set) p.set("set", state.set);
	if (state.style) p.set("style", state.style);
	if (state.category) p.set("cat", state.category);
	if (state.query) p.set("q", state.query);
	if (state.page) p.set("page", String(state.page));
	if (state.view === "selection") p.set("view", "selection");
	for (const k of ["grid", "ink", "ss"] as const) if (state[k] !== DEFAULTS[k]) p.set(k, String(state[k]));
	if (withSelection && selection.length) p.set("sel", selection.join(","));
	const edited = encodeStore(edits, shareable);
	if (edited) p.set("edit", edited);
	return `#${p.toString().replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%7E/g, "~")}`;
};

const writeHash = () => history.replaceState(null, "", hashFor(true));

await initWasm(fetch(wasmUrl));

const pixelSvg = createPixelSvg((svg, size) => {
	const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size }, font: { loadSystemFonts: false } });
	const image = resvg.render();
	const out = { pixels: image.pixels, height: image.height };
	image.free();
	resvg.free();
	return out;
});

const sprite = (svg: string): PixelResult | undefined => {
	try {
		return pixelSvg(svg, { grid: state.grid, ink: state.ink, supersample: state.ss });
	} catch {
		return undefined;
	}
};

const customSvgs = new Map<string, string>();
const sourceOf = (id: string) => customSvgs.get(id) ?? svgOf(id);

const editsOf = (id: string) => edits.get(editKey(id, state.grid));

/** The sprite with any hand edits for the current grid applied. */
const spriteFor = (id: string, svg: string) => {
	const base = sprite(svg);
	return base && applyEdits(base, editsOf(id), swatches(svg, base), state.grid);
};

let list: string[] = [];
let info: SetInfo | undefined;
let featured: string[] = [];

const landing = () => state.view === "browse" && !state.set && !state.query;

const isSelected = (id: string) => selection.includes(id);

const toggle = (id: string, on = !isSelected(id)) => {
	const i = selection.indexOf(id);
	if (on && i < 0) selection.push(id);
	if (!on && i >= 0) selection.splice(i, 1);
	for (const box of document.querySelectorAll<HTMLInputElement>(`input[data-id="${CSS.escape(id)}"]`)) box.checked = on;
	syncTray();
	writeHash();
	if (state.view === "selection") draw();
};

const cell = (id: string, svg: string) => {
	const result = spriteFor(id, svg);
	const wrap = document.createElement("div");
	wrap.className = "cell";
	wrap.dataset.id = id;
	if (result) wrap.dataset.mode = result.mode;
	wrap.style.setProperty("--size", `${state.grid * Math.max(1, Math.round(48 / state.grid))}px`);

	const open = document.createElement("button");
	open.type = "button";
	open.className = "open";
	open.title = id;
	open.innerHTML = `<div class="pair"><div class="src">${svg}</div><div class="px">${result ? toSvg(result, state.grid) : "⚠"}</div></div><div class="name"></div>${tags(id, result)}`;
	(open.querySelector(".name") as HTMLElement).textContent = id;
	open.addEventListener("click", () => openDetail(id));

	const pick = document.createElement("label");
	pick.className = "pick";
	pick.title = "Select for export";
	const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: isSelected(id) });
	box.dataset.id = id;
	box.setAttribute("aria-label", `Select ${id}`);
	box.addEventListener("change", () => toggle(id, box.checked));
	pick.append(box);

	wrap.append(open, ...(customSvgs.has(id) ? [] : [pick]));
	return wrap;
};

const tags = (id: string, result: PixelResult | undefined) => {
	const labels = [...(result && result.mode !== "stroke" ? [result.mode] : []), ...(editsOf(id)?.size ? ["edited"] : [])];
	return labels.length ? `<div class="tag">${labels.join(" · ")}</div>` : "";
};

const refreshCell = (id: string) => {
	const svg = sourceOf(id);
	if (!svg) return;
	for (const old of document.querySelectorAll<HTMLElement>(`.cell[data-id="${CSS.escape(id)}"]`)) old.replaceWith(cell(id, svg));
};

const visible = () => (state.view === "selection" ? selection : list);
const pageIds = () => visible().slice(state.page * PAGE, (state.page + 1) * PAGE);

const draw = () => {
	const ids = pageIds();
	el.icons.replaceChildren(...ids.flatMap((id) => (sourceOf(id) ? [cell(id, sourceOf(id) as string)] : [])));
	const pages = Math.max(1, Math.ceil(visible().length / PAGE));
	el.pager.hidden = pages <= 1;
	el.page.textContent = `${state.page + 1} / ${pages}`;
	el.prev.disabled = state.page === 0;
	el.next.disabled = state.page >= pages - 1;
	drawCustom();
};

const setName = (prefix: string) => el.set.querySelector<HTMLOptionElement>(`option[value="${prefix}"]`)?.dataset.name ?? prefix;

const describe = () => {
	if (state.view === "selection") {
		return selection.length ? `${selection.length} selected` : "Nothing selected yet. Tick icons to add them.";
	}
	if (landing()) return "A few icons from popular sets. Search all of them above, or pick a set.";
	const where = state.set ? setName(state.set) : "all sets";
	const style = state.style && info?.themes ? ` · ${info.themes.labels[state.style === "base" ? "" : state.style]}` : "";
	const cat = state.category ? ` · ${state.category}` : "";
	const what = state.query ? `“${state.query}” in ${where}` : where;
	// The search API stops at 999 results.
	const count = state.query && list.length >= 999 ? "999+" : String(list.length);
	return `${count} icons · ${what}${style}${cat}`;
};

const renderStatus = () => {
	el.status.replaceChildren(describe());
	if (state.view !== "browse" || !state.set || !state.query) return;
	const wider = document.createElement("button");
	wider.type = "button";
	wider.className = "link";
	wider.textContent = "Search all sets instead";
	wider.addEventListener("click", () => go({ set: "", style: "", category: "" }));
	el.status.append(" · ", wider);
};

const syncFilters = () => {
	const themes = state.set ? info?.themes : undefined;
	$("style-field").hidden = !themes;
	if (themes) {
		el.style.replaceChildren(
			new Option("All styles", ""),
			...Object.entries(themes.labels).map(([k, label]) => new Option(label, k || "base")),
		);
		el.style.value = state.style;
	}
	const categories = state.set ? info?.categories : undefined;
	$("category-field").hidden = !categories;
	if (categories) {
		el.category.replaceChildren(new Option("All categories", ""), ...Object.keys(categories).map((c) => new Option(c, c)));
		el.category.value = state.category;
	}
	el.query.placeholder = state.set ? `Search ${setName(state.set)}…` : "Search all sets: mail, rocket, heart…";
};

let token = 0;
const load = async () => {
	const mine = ++token;
	writeHash();
	try {
		el.status.textContent = "Loading…";
		info = state.set ? await setInfo(state.set) : undefined;
		if (mine !== token) return;
		syncFilters();
		if (state.view === "selection") {
			list = [];
		} else if (landing()) {
			list = featured;
		} else if (state.query) {
			list = await search(state.query, state.set || undefined);
		} else {
			list = info?.ids ?? [];
		}
		if (info?.themes && state.style) {
			const want = state.style === "base" ? "" : state.style;
			const themes = info.themes;
			list = list.filter((id) => themeOf(id, themes) === want);
		}
		if (info?.categories && state.category) {
			const members = new Set((info.categories[state.category] ?? []).map((n) => `${state.set}:${n}`));
			list = list.filter((id) => members.has(id));
		}
		if (mine !== token) return;
		state.page = Math.min(state.page, Math.max(0, Math.ceil(visible().length / PAGE) - 1));
		await loadIcons(pageIds());
		if (mine !== token) return;
		renderStatus();
		syncViews();
		draw();
	} catch (e) {
		if (mine === token) el.status.textContent = `Couldn't load icons: ${(e as Error).message}`;
	}
};

const syncViews = () => {
	$("view-browse").setAttribute("aria-selected", String(state.view === "browse"));
	$("view-selection").setAttribute("aria-selected", String(state.view === "selection"));
};

const syncTray = () => {
	$("sel-count").textContent = String(selection.length);
	$("tray-count").textContent = String(selection.length);
	el.tray.hidden = selection.length === 0;
	document.body.classList.toggle("has-tray", selection.length > 0);
};

let frame = 0;
const redraw = () => {
	cancelAnimationFrame(frame);
	frame = requestAnimationFrame(() => {
		writeHash();
		draw();
		if (el.detail.open && current) openDetail(current);
	});
};

const syncControls = () => {
	for (const k of ["grid", "ink", "ss"] as const) {
		el[k].value = String(state[k]);
		$(`${k}-out`).textContent = String(state[k]);
	}
	el.query.value = state.query;
	el.set.value = state.set;
};

const go = (patch: Partial<State>) => {
	state = { ...state, page: 0, ...patch };
	syncControls();
	load();
};

for (const k of ["grid", "ink", "ss"] as const) {
	el[k].addEventListener("input", () => {
		state[k] = Number(el[k].value);
		$(`${k}-out`).textContent = el[k].value;
		redraw();
	});
}

$("reset").addEventListener("click", () => {
	Object.assign(state, DEFAULTS);
	syncControls();
	redraw();
});

el.set.addEventListener("change", () => go({ set: el.set.value, style: "", category: "", view: "browse" }));
el.style.addEventListener("change", () => go({ style: el.style.value, view: "browse" }));
el.category.addEventListener("change", () => go({ category: el.category.value, view: "browse" }));

let searchTimer = 0;
el.query.addEventListener("input", () => {
	clearTimeout(searchTimer);
	searchTimer = window.setTimeout(() => go({ query: el.query.value.trim(), view: "browse" }), 300);
});

$("view-browse").addEventListener("click", () => go({ view: "browse" }));
$("view-selection").addEventListener("click", () => go({ view: "selection" }));

const turn = (delta: number) => {
	state.page += delta;
	load();
	scrollTo({ top: 0 });
};
el.prev.addEventListener("click", () => turn(-1));
el.next.addEventListener("click", () => turn(1));

const addCustom = (svg: string, name: string) => customSvgs.set(name, svg);

const drawCustom = () => {
	const pasted = el.svgInput.value.trim();
	if (pasted.includes("<svg")) addCustom(pasted, "pasted");
	else customSvgs.delete("pasted");
	el.customOut.replaceChildren(...[...customSvgs].map(([id, svg]) => cell(id, svg)));
};
el.svgInput.addEventListener("input", drawCustom);

const readFiles = async (files: Iterable<File>) => {
	for (const file of files) addCustom(await file.text(), file.name.replace(/\.svg$/i, ""));
	($("custom") as HTMLDetailsElement).open = true;
	drawCustom();
};
el.svgFile.addEventListener("change", () => el.svgFile.files && readFiles(el.svgFile.files));
for (const target of [el.svgInput, el.customOut]) {
	target.addEventListener("dragover", (e) => e.preventDefault());
	target.addEventListener("drop", (e) => {
		e.preventDefault();
		if (e.dataTransfer?.files.length) readFiles(e.dataTransfer.files);
	});
}

let current: string | undefined;
let currentSvg = "";
let currentPath = "";

const editor = {
	base: undefined as PixelResult | undefined,
	colors: [] as string[],
	tool: 0,
	undo: new Map<string, Edits[]>(),
};

const openDetail = (id: string) => {
	const svg = sourceOf(id);
	if (!svg) return;
	if (current !== id) editor.tool = 0;
	current = id;
	editor.base = sprite(svg);
	editor.colors = editor.base ? swatches(svg, editor.base) : [];
	editor.tool = Math.min(editor.tool, editor.colors.length - 1);
	for (const box of ["detail-src", "detail-px", "detail-overlay"]) $(box).style.setProperty("--grid", String(state.grid));
	$("detail-src").innerHTML = svg;
	const custom = customSvgs.has(id);
	$("detail-select").hidden = custom;
	$("detail-select").textContent = isSelected(id) ? "Deselect" : "Select";
	$("detail-style").hidden = custom;
	renderSwatches();
	renderDetail();
	if (!el.detail.open) el.detail.showModal();
};

const renderDetail = () => {
	const id = current;
	const svg = id && sourceOf(id);
	if (!id || !svg) return;
	const result = editor.base && applyEdits(editor.base, editsOf(id), editor.colors, state.grid);
	currentSvg = toSvg(result ?? "", state.grid);
	currentPath = result?.layers
		? result.layers.map(({ fill, d }) => `${fill}: ${d}`).join("\n")
		: (result?.d ?? "");
	const notes = [...(result && result.mode !== "stroke" ? [`${result.mode} mode`] : []), ...(editsOf(id)?.size ? ["edited"] : [])];
	$("detail-name").textContent = [id, ...notes].join(" · ");
	$("detail-px").innerHTML = `${currentSvg}<div class="cursor" hidden></div>`;
	$("detail-overlay").innerHTML = `<div class="px-layer">${currentSvg}</div><div class="src-layer">${svg}</div>`;
	$("detail-scales").innerHTML = [1, 2, 3, 4]
		.map((n) => `<div>${currentSvg.replace("<svg ", `<svg width="${state.grid * n}" height="${state.grid * n}" `)}<span>${n}×</span></div>`)
		.join("");
	$("detail-code").textContent = currentPath;
	($("edit-undo") as HTMLButtonElement).disabled = !editor.undo.get(editKey(id, state.grid))?.length;
	($("edit-reset") as HTMLButtonElement).disabled = !editsOf(id)?.size;
};

const renderSwatches = () => {
	$("swatches").replaceChildren(
		...editor.colors.map((fill, i) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "swatch";
			button.style.setProperty("--swatch", fill === "currentColor" ? "var(--fg)" : fill);
			button.title = fill === "currentColor" ? "Ink" : fill;
			button.setAttribute("aria-label", `Paint with ${button.title}`);
			button.setAttribute("aria-pressed", String(editor.tool === i));
			button.addEventListener("click", () => {
				editor.tool = i;
				renderSwatches();
			});
			return button;
		}),
	);
	$("tool-erase").setAttribute("aria-pressed", String(editor.tool === ERASE));
};

$("tool-erase").addEventListener("click", () => {
	editor.tool = ERASE;
	renderSwatches();
});

const commit = (id: string) => {
	renderDetail();
	refreshCell(id);
	writeHash();
};

const snapshot = (id: string) => {
	const key = editKey(id, state.grid);
	const stack = editor.undo.get(key) ?? [];
	stack.push(new Map(edits.get(key)));
	editor.undo.set(key, stack.slice(-100));
};

const undo = () => {
	if (!current) return;
	const key = editKey(current, state.grid);
	const previous = editor.undo.get(key)?.pop();
	if (!previous) return;
	if (previous.size) edits.set(key, previous);
	else edits.delete(key);
	commit(current);
};

$("edit-undo").addEventListener("click", undo);
$("edit-reset").addEventListener("click", () => {
	if (!current || !editsOf(current)?.size) return;
	snapshot(current);
	edits.delete(editKey(current, state.grid));
	commit(current);
});

el.detail.addEventListener("keydown", (e) => {
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
		e.preventDefault();
		undo();
	}
});

const pixelAt = (e: PointerEvent) => {
	const box = $("detail-px").getBoundingClientRect();
	const x = Math.floor(((e.clientX - box.left) / box.width) * state.grid);
	const y = Math.floor(((e.clientY - box.top) / box.height) * state.grid);
	return x >= 0 && y >= 0 && x < state.grid && y < state.grid ? { x, y, i: y * state.grid + x } : undefined;
};

const moveCursor = (e: PointerEvent) => {
	const cursor = $("detail-px").querySelector<HTMLElement>(".cursor");
	const at = pixelAt(e);
	if (!cursor) return;
	cursor.hidden = !at;
	if (!at) return;
	const size = 100 / state.grid;
	Object.assign(cursor.style, { left: `${at.x * size}%`, top: `${at.y * size}%`, width: `${size}%`, height: `${size}%` });
};

let stroke: { op: number; last: number } | undefined;

const paint = (id: string, i: number, op: number) => {
	if (!editor.base) return;
	const key = editKey(id, state.grid);
	const map = edits.get(key) ?? new Map();
	const original = toCells(editor.base, state.grid)[i];
	const value = op === ERASE ? null : editor.colors[op];
	// Store only differences from the generated sprite, so the URL stays short.
	if (original === value) map.delete(i);
	else map.set(i, op);
	if (map.size) edits.set(key, map);
	else edits.delete(key);
};

$("detail-px").addEventListener("pointerdown", (e) => {
	const at = pixelAt(e);
	if (!current || !editor.base || !at) return;
	e.preventDefault();
	$("detail-px").setPointerCapture(e.pointerId);
	const now = toCells(applyEdits(editor.base, editsOf(current), editor.colors, state.grid), state.grid)[at.i];
	// Starting on a pixel that already has the active colour clears instead, like a toggle.
	const op = editor.tool === ERASE || now === editor.colors[editor.tool] ? ERASE : editor.tool;
	snapshot(current);
	stroke = { op, last: at.i };
	paint(current, at.i, op);
	renderDetail();
	moveCursor(e);
});

$("detail-px").addEventListener("pointermove", (e) => {
	moveCursor(e);
	const at = pixelAt(e);
	if (!stroke || !current || !at || at.i === stroke.last) return;
	stroke.last = at.i;
	paint(current, at.i, stroke.op);
	renderDetail();
	moveCursor(e);
});

const endStroke = () => {
	if (!stroke || !current) return;
	stroke = undefined;
	commit(current);
};
$("detail-px").addEventListener("pointerup", endStroke);
$("detail-px").addEventListener("pointercancel", endStroke);
$("detail-px").addEventListener("pointerleave", () => {
	const cursor = $("detail-px").querySelector<HTMLElement>(".cursor");
	if (cursor) cursor.hidden = true;
});

$("detail-select").addEventListener("click", () => {
	if (!current) return;
	toggle(current);
	$("detail-select").textContent = isSelected(current) ? "Deselect" : "Select";
});

$("detail-style").addEventListener("click", async () => {
	if (!current) return;
	const prefix = current.slice(0, current.indexOf(":"));
	const themes = (await setInfo(prefix)).themes;
	const style = themes ? themeOf(current, themes) || "base" : "";
	el.detail.close();
	go({ set: prefix, style, category: "", view: "browse" });
});

const flash = (button: HTMLElement, text: string) => {
	const label = button.textContent;
	button.textContent = text;
	setTimeout(() => (button.textContent = label), 1200);
};

const copy = async (button: HTMLElement, text: string) => {
	await navigator.clipboard.writeText(text);
	flash(button, "Copied");
};
$("copy-svg").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, currentSvg));
$("copy-d").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, currentPath));
$("download-svg").addEventListener("click", () => current && download(`${current.replace(":", "-")}.svg`, currentSvg, "image/svg+xml"));

$("clear").addEventListener("click", () => {
	selection.splice(0, selection.length);
	for (const box of document.querySelectorAll<HTMLInputElement>(".pick input")) box.checked = false;
	syncTray();
	writeHash();
	if (state.view === "selection") load();
});

$("share").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, `${location.origin}${location.pathname}${hashFor(true)}`));

const selectedSprites = async (): Promise<Sprite[]> => {
	await loadIcons(selection);
	return selection.flatMap((id) => {
		const svg = svgOf(id);
		const result = svg && spriteFor(id, svg);
		return result ? [{ id, result }] : [];
	});
};

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
	button.addEventListener("click", async () => {
		button.disabled = true;
		try {
			const sprites = await selectedSprites();
			const settings = { grid: state.grid, ink: state.ink, supersample: state.ss };
			const base = `pixel-icons-${state.grid}`;
			switch (button.dataset.export) {
				case "zip":
					download(`${base}.zip`, svgZip(sprites, settings) as BlobPart, "application/zip");
					break;
				case "sprite":
					download(`${base}-sprite.svg`, svgSprite(sprites, settings), "image/svg+xml");
					break;
				case "png": {
					const scale = Number($<HTMLSelectElement>("png-scale").value);
					download(`${base}@${scale}x.png`, await pngSheet(sprites, settings, scale, $<HTMLInputElement>("png-ink").value), "image/png");
					break;
				}
				case "json":
					download(`${base}.json`, manifest(sprites, settings), "application/json");
					break;
			}
		} catch (e) {
			flash(button, "Failed");
			console.error(e);
		} finally {
			button.disabled = false;
		}
	});
}

addEventListener("hashchange", () => {
	state = readHash();
	syncControls();
	syncTray();
	load();
});

const sets = await collections();
featured = FEATURED.flatMap((prefix) => (SAMPLES[prefix] ?? sets[prefix]?.samples ?? []).map((name) => `${prefix}:${name}`));
const all = new Option("All sets", "");
el.set.replaceChildren(
	all,
	...Object.entries(sets)
		.filter(([, c]) => !c.hidden)
		.sort(([, a], [, b]) => a.name.localeCompare(b.name))
		.map(([prefix, c]) => {
			const option = new Option(`${c.name} (${c.total})${c.palette ? " · colour" : ""}`, prefix);
			option.dataset.name = c.name;
			return option;
		}),
);

syncControls();
syncTray();
load();
