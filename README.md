# iconify-pixel

Redraw any [Iconify](https://iconify.design) icon as a crisp pixel-art sprite, at build time.

**[Playground](https://sirlisko.github.io/iconify-pixel/)**: browse any icon set and tune the options live.

```sh
npm i iconify-pixel @iconify-json/lucide
```

```ts
import { pixelIcon, toSvg } from "iconify-pixel";

const { d } = pixelIcon("lucide:mail");
toSvg(d); // <svg viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">…
```

The result is a single path with one rectangle per run of pixels, so it scales cleanly and takes `currentColor`.

## How it works

Every stroke is redrawn exactly one grid pixel wide, with square caps and mitred joins. The icon is then rasterised, downsampled to the grid, and any pixel whose coverage reaches `ink` is filled.

## Which icon sets work

Outline sets drawn with strokes work best, e.g. Lucide, Tabler (outline) and Feather. In a test across every icon in Lucide and Tabler, most came out clearly recognisable. Common failures:

- tiny corner badges (`$`, `×`, a cog)
- text inside icons
- dense patterns

Filled sets (Phosphor, Material, Font Awesome…) have no strokes to snap to the grid. They come back with `mode: "fill"`, often look heavy and lose detail.

Icons with fixed colours (emoji sets such as Twemoji or Fluent Emoji, Flat Color Icons, logos) come back with `mode: "color"`. They also get `layers`: one path per colour, taken from the icon's own palette. Icons drawn in `currentColor` or plain black stay single-colour, so you can still recolour them.

```ts
const rocket = pixelIcon("twemoji:rocket");
// { mode: "color", d, layers: [{ fill: "#a0041e", d: "…" }, …] }
toSvg(rocket); // draws every layer
```

## API

### `pixelIcon(name, options?)`

`name` is `"prefix:icon"`. The set is loaded from `@iconify-json/<prefix>`, or pass its JSON as `options.collection`. Returns `{ d, mode, layers? }`. `d` is always the full silhouette.

### `pixelSvg(svg, options?)`

The same for any SVG string.

| Option        | Default        | Description                                                          |
| ------------- | -------------- | -------------------------------------------------------------------- |
| `grid`        | `16`           | Sprite size in pixels                                                |
| `ink`         | `100`          | Alpha (0–255) a pixel needs to be filled. Lower fills in curves, higher breaks diagonals |
| `viewBox`     | from the SVG   | Width of the icon's coordinate space                                 |
| `supersample` | `12`           | Subpixels sampled per sprite pixel, along each axis                  |

### `toSvg(sprite, grid = 16)`

Wraps a path, or a whole result including its colour layers, in an `<svg>` element.

## Development

- `npm run dev`: the playground, same core rendered with resvg-wasm
- `npm test`, `npm run typecheck`, `npm run build`
- `npm run parity`: compares against the sharp pipeline this started from

## Contact sheets

`npm run sheet` renders every icon in Lucide, Tabler and Phosphor to `out/` so you can compare each original with its sprite. Pass `--ink=<n>` to try a different threshold.
