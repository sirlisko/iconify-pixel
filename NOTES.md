# Project notes

Where things stand and what to do next. Last updated 2026-10-08.

## Origin and direction

The idea started with `src/lib/pixelIcon.ts` in sirlisko.com ([PR #61](https://github.com/sirlisko/sirlisko.com/pull/61)). That code renders five Lucide icons as 16×16 sprites with sharp. This repo generalises it to any Iconify icon.

**Decision (2026-10-08): the page is the product, with no npm package for now.**
- Most people want a handful of icons, and the page gives them those with nothing to install.
- A bare `pixelIcon()` function adds little until there's a build integration.
- The main quality issue (lines on pixel boundaries, below) may still change the output.

The package scaffolding (`exports`, `dist`, build config) was removed, and `package.json` is `private`. The core is still a clean module, so publishing later would take about an hour. The README asks people to open an issue if they want a package. Treat repeated requests as the signal to publish.

## Status

- **Page**: https://sirlisko.github.io/iconify-pixel/ (`demo/`). Every push to `main` type-checks, runs the tests, builds and deploys it (`.github/workflows/pages.yml`).
  - **Browse** any Iconify set, or search across all of them ("All sets").
  - **Filter** by style (from Iconify's `suffixes`/`prefixes` metadata, e.g. Phosphor weights, Material Symbols variants) and by category, when the set provides them. Search within a set uses the API's `prefix` parameter.
  - **More in this style** (in the detail dialog) jumps to the icon's set and style and keeps the search, so you can find matching icons.
  - **Select and export** with the checkbox on each cell. The bar at the bottom exports:
    - SVG files (zip via fflate)
    - an SVG `<symbol>` sprite
    - a PNG sheet at 1/2/4/8×, with an ink colour for single-colour icons
    - JSON (paths, layers and each icon's x/y in the PNG sheet)
  - **Copy link** saves the set, style, query, settings and selection in the URL hash.
  - **Your own SVGs**: paste, drop or pick files.
  - **Pixel editing** (detail view): paint with the icon's palette (or ink for single-colour icons), erase, undo and reset.
    - Edits are stored as a diff from the generated sprite, per icon and grid size (`demo/edit.ts`). They therefore survive ink and supersample tweaks.
    - Every export applies them.
    - They're saved in the URL as `edit=<id>~<grid>~<changes>` entries joined by `.`. Each change is the pixel index (2 base-36 characters) plus the palette index (1 character) or `-` to erase. Custom SVGs are editable but can't be shared.
  - **Controls**: grid, ink and supersample, plus a detail view with an overlay.
- **Core** (`src/core.ts`): renderer-agnostic and dependency-free.
  - `createPixelSvg(render)` returns `(svg, opts) → { d, mode, layers? }`.
    - `mode: "stroke"`: strokes snapped to the grid, the best case.
    - `mode: "fill"`: no strokes, so expect lower quality.
    - `mode: "color"`: the icon uses fixed colours and comes with `layers`, one path per colour.
  - Options: `grid` (16), `ink` (100), `viewBox` (read from the SVG), `supersample` (12).
- **Repo**: github.com/sirlisko/iconify-pixel, public (needed for Pages on the current GitHub plan).
- **Name**: the page is called **pixelicons**, and the repo keeps `iconify-pixel`.
- **Domain (pending)**: pixelicons.sirlisko.com. Once Cloudflare has a CNAME `pixelicons` → `sirlisko.github.io`:
  1. Set the custom domain on the repo.
  2. Change `base` in `vite.config.ts` to `/`.
  3. Update the URLs in the README and `package.json`.
  4. Enforce HTTPS once the certificate is issued.

  Don't set the domain before the DNS record exists: the github.io URL would redirect to a name that doesn't point here yet.

## How it works

1. **Prepare** (`prepare` in `src/core.ts`).
   - Normalise the input: trim anything before `<svg` (XML prolog, comments) and add `xmlns` if it's missing.
   - If there are strokes, set every stroke to `viewBoxWidth / grid` (one grid pixel), with square caps and mitred joins. The width comes from the viewBox, or from `width` if there's no viewBox.
   - Fill-only SVGs are left as they are.
2. **Render**. The renderer is passed in as `Render`:
   - browser: `@resvg/resvg-wasm` (`demo/main.ts`)
   - Node: `@resvg/resvg-js` (`src/pixelate.ts`, used by the tests and scripts)
3. **Downsample**. Average the alpha of each `supersample²` block into one pixel.
4. **Threshold**. A pixel is inked when its alpha is at least `ink`.
   - **Colour mode**: when the icon paints with fixed colours, i.e. anything other than `currentColor` or plain `#000`, the palette is read from its `fill`, `stroke` and `stop-color` values. Each inked pixel then takes the colour most of its opaque subpixels are closest to. `currentColor` stays a layer of its own.
5. **Output**. Merge horizontal runs into one path (`runsToPath`).

## Findings

- **Matches the site.** Across the five site icons, the resvg pipeline differs from sharp/lanczos3 by 2 of 1,280 pixels at `ink=100`. Run `npm run parity`.
- **resvg is slow unless you disable system fonts.** It scans every system font each time it renders, which took about 190 ms per icon. With `font: { loadSystemFonts: false }` it takes about 0.2 ms.
- **resvg-js is Node-only.** It is a native binding. Browsers need `@resvg/resvg-wasm`, which has the same API apart from `initWasm`.
- **resvg rejects invalid XML.** Duplicate attributes or a missing `xmlns` make it fail, hence the normalisation step. This caused the "Try your own SVG" bug: SVGs copied from lucide.dev set `stroke-width` on the root, and we added a second one.
- **resvg's pixels are premultiplied.** Divide by alpha before matching colours.
- **Hit rate.** These are my estimates from a random sample of 96 icons per set, judged by eye:

  | Set | Recognisable | Notes |
  | --- | --- | --- |
  | Lucide | ~80–85% | |
  | Tabler outline | ~75% | |
  | Phosphor regular | ~60% | Fill mode, heavy-looking |
  | Emoji sets | good | Colour mode |

  The automatic flags in `npm run sheet` catch almost nothing.
- **Common failures:**
  - small corner badges (`$`, `×`, `₿`, cog)
  - text inside icons
  - dense patterns
  - filled sets in general

## Next steps

1. **Lines on pixel boundaries render 2px wide.** This is the biggest quality issue. A 24-unit set maps onto 16 pixels at ×2/3, so any line at a multiple of 3 (x=18 → 12.0) sits exactly on a pixel boundary. Both neighbouring pixels get ~50% alpha, both pass `ink=100`, and the line doubles in width. The overlay in the detail view (e.g. `lucide:a-arrow-down`) shows it clearly. Ideas:
   - When two neighbouring pixels in a straight line both sit near 50%, keep only one (a consistent tie-break, e.g. left/top).
   - Nudge the geometry by half a grid pixel before rendering.
   - Run a thinning pass on the binary mask.

   Measure any change with `parity` and the contact sheets.
2. **Editor extras, if people use it:**
   - a custom colour picker (today the palette is limited to the icon's own colours)
   - flood fill
   - keeping edits when the grid changes (today they're per grid size)
3. **Corner badges.** Detect small, separate shapes in a corner and drop them.
4. **Colour mode limits.**
   - Thin details drawn in a minority colour lose the vote and disappear.
   - Gradients snap to their nearest stop colour.
   - Named colours other than black and white are ignored, as are colours set through CSS classes.
5. **Fill sets.** Try something specific to them, e.g. a higher `ink`, or an outline-only pass.
6. **Spread the word.** Write a short post on sirlisko.com linking to the page. That tells us whether anyone wants a package.
7. **If publishing to npm later:**
   - restore the build (`tsc` to `dist/`, an `exports` map)
   - expose `createPixelSvg` with resvg-js and resvg-wasm entry points
   - consider an Astro component (`<PixelIcon name="lucide:mail" />`)
   - add a CHANGELOG
   - add CI on several Node versions

## Layout

```
demo/index.html, style.css   the page
demo/main.ts       UI: browsing, filters, selection, detail dialog, URL state
demo/api.ts        Iconify API: collections, set info (styles/categories), search, icon SVGs
demo/export.ts     zip, SVG sprite, PNG sheet, JSON manifest
demo/edit.ts       pixel edits: cells ↔ sprite, applying diffs, URL encoding
src/core.ts        renderer-agnostic core: prepare, downsample, colorLayers, runsToPath, toSvg, createPixelSvg
src/pixelate.ts    Node renderer (resvg-js), for tests and scripts
src/iconify.ts     Node helpers to load icons from @iconify-json/* packages
scripts/parity.ts  sharp-vs-resvg check against the site's five icons
scripts/contact-sheet.ts   full-set HTML sheets into out/ (--ink=<n>)
test/              vitest
```

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm run parity` · `npm run sheet`
