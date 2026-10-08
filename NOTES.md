# Project notes

Where things stand and what to do next. Last updated 2026-10-08.

## Origin

The idea started with `src/lib/pixelIcon.ts` in sirlisko.com ([PR #61](https://github.com/sirlisko/sirlisko.com/pull/61)). That code renders five Lucide icons as 16×16 sprites with sharp. This repo generalises it to any Iconify icon. It is **not published to npm yet**: we want to test it on the playground first.

## Status

- **Package** `iconify-pixel` v0.1.0. It builds, the tests pass and it packs to about 3 kB.
  - API: `pixelIcon("prefix:name", opts)`, `pixelSvg(svg, opts)`, `toSvg(d, grid)` and `runsToPath`.
  - Every call returns `{ d, mode, layers? }`:
    - `mode: "stroke"`: strokes snapped to the grid, the best case.
    - `mode: "fill"`: no strokes, so expect lower quality.
    - `mode: "color"`: the icon uses fixed colours and comes with `layers`, one path per colour.
  - Options: `grid` (16), `ink` (100), `viewBox` (read from the SVG), `supersample` (12). (`demo/`), deployed to GitHub Pages on every push to `main`. It fetches icons live from the Iconify API, so every public set is available, and has controls for grid, ink and supersample.
- **Repo**: github.com/sirlisko/iconify-pixel, public (needed for Pages on the current GitHub plan).

## How it works

1. **Prepare** (`src/core.ts`). If the SVG has strokes, set every stroke to `viewBoxWidth / grid` (one grid pixel), with square caps and mitred joins. Fill-only SVGs are left as they are.
2. **Render**. The renderer is passed in as `Render`:
   - Node: `@resvg/resvg-js` (`src/pixelate.ts`)
   - browser: `@resvg/resvg-wasm` (`demo/main.ts`)
3. **Downsample**. Average the alpha of each `supersample²` block into one pixel.
4. **Threshold**. A pixel is inked when its alpha is at least `ink`.
   - **Colour mode**: when the icon paints with fixed colours, i.e. anything other than `currentColor` or plain `#000`, the palette is read from its `fill`, `stroke` and `stop-color` values. Each inked pixel then takes the colour most of its opaque subpixels are closest to. `currentColor` stays a layer of its own.
5. **Output**. Merge horizontal runs into one path (`runsToPath`).

## Findings

- **Matches the site.** Across the five site icons, the resvg pipeline differs from sharp/lanczos3 by 2 of 1,280 pixels at `ink=100`. Run `npm run parity`.
- **resvg-js is slow unless you disable system fonts.** It scans every system font each time it renders, which took about 190 ms per icon. With `font: { loadSystemFonts: false }` it takes about 0.2 ms. Keep that option in any renderer.
- **resvg-js is Node-only.** It is a native binding. Browsers and edge runtimes need `@resvg/resvg-wasm`, which has the same API apart from `initWasm`. That's why the core takes the renderer as an argument.
- **Hit rate.** These are my estimates from a random sample of 96 icons per set, judged by eye:

  | Set | Recognisable | Notes |
  | --- | --- | --- |
  | Lucide | ~80–85% | |
  | Tabler outline | ~75% | |
  | Phosphor regular | ~60% | Fill mode, heavy-looking |

  The automatic flags in `npm run sheet` (empty, sparse, blob) catch almost nothing. Real failures are recognisable shapes that lose their meaning.
- **Colour icons:** at first, multicolour sets (Twemoji, Flat Color Icons, Fluent Emoji…) came out as black silhouettes, because the core only reads alpha. Colour mode fixes that, and emoji look good at 16×16. resvg's pixels are premultiplied, so divide by alpha before matching colours.
- **Common failures:**
  - small corner badges (`$`, `×`, `₿`, cog)
  - text inside icons
  - dense patterns (regex, fingerprint)
  - filled sets in general: no strokes to snap, and lines that straddle pixels come out 2px wide

## Known issues / next steps

1. **Lines on pixel boundaries render 2px wide.** This is the biggest quality issue. A 24-unit set maps onto 16 pixels at ×2/3, so any line at a multiple of 3 (x=18 → 12.0) sits exactly on a pixel boundary. Both neighbouring pixels get ~50% alpha, both pass `ink=100`, and the line doubles in width. The overlay view in the playground (e.g. `lucide:a-arrow-down`) shows it clearly. Ideas:
   - When two neighbouring pixels in a straight line both sit near 50%, keep only one (a consistent tie-break, e.g. left/top).
   - Nudge the geometry by half a grid pixel before rendering.
   - Run a thinning pass on the binary mask.

   Whatever we pick, measure it with `parity` and the contact sheets so the site icons don't regress.
2. **Corner badges.** Detect small, separate shapes in a corner and drop them or simplify them. Or let users override individual icons.
3. **Colour mode limits.**
   - Thin details drawn in a minority colour lose the vote and disappear.
   - Gradients snap to their nearest stop colour.
   - Named colours other than black and white are ignored, as are colours set through CSS classes.
4. **Fill sets.** Either keep them as "experimental" or try something specific to them, e.g. an outline-only pass or a higher `ink`.
5. **Browser entry point.** Publish an `iconify-pixel/wasm` export built on `createPixelSvg` with resvg-wasm. The playground already shows it works.
6. **Integrations.** An Astro component (`<PixelIcon name="lucide:mail" />`) is the first target, since the site would use it.
7. **Before publishing to npm:**
   - decide on the default `ink` once item 1 is settled
   - add a CHANGELOG
   - add CI tests on Node 18/20/22 (the `engines` field says `>=18`)

## Layout

```
src/core.ts        renderer-agnostic core: prepare, downsample, runsToPath, toSvg, createPixelSvg
src/pixelate.ts    Node renderer (resvg-js); exports pixelSvg, rasterAlpha
src/iconify.ts     pixelIcon / iconSvg: loads @iconify-json/<prefix> from this package or the app
src/index.ts       public exports
demo/              playground (Vite, resvg-wasm, Iconify API)
scripts/parity.ts  sharp-vs-resvg check against the site's five icons
scripts/contact-sheet.ts   full-set HTML sheets into out/ (--ink=<n>)
test/              vitest
```

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm run build:site` · `npm run parity` · `npm run sheet`
