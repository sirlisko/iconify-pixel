# pixelicons

Turn any [Iconify](https://iconify.design) icon into crisp pixel art.

**→ [sirlisko.github.io/iconify-pixel](https://sirlisko.github.io/iconify-pixel/)**

- **Find icons.** Browse any of Iconify's 200+ sets, or search across all of them. Narrow a set down by style (e.g. Phosphor Bold, Material Symbols Rounded) or category. From any icon, **More in this style** jumps to its set and style, so the rest of your icons match.
- **Tune.** Change the grid size, the ink threshold and the supersampling. Each icon has a detail view that overlays the original on the sprite.
- **Edit pixels.** In the detail view, paint with the icon's own colours, erase, and undo (⌘/Ctrl+Z). Use it to clean up what the conversion gets wrong, such as lines that come out 2px wide or tiny badges. Edits are stored per grid size, show up in every export, and are saved in the share link.
- **Export.** Tick the icons you want, then download them in any of these formats:

  | Format | Contents |
  | --- | --- |
  | SVG files | a zip with one file per icon |
  | SVG sprite | a single file of `<symbol>`s |
  | PNG sheet | an image at 1–8× |
  | JSON | the paths, plus each icon's position in the PNG sheet |

  **Copy link** saves your selection and settings in a URL.
- **Your own SVGs.** Paste markup, or drop `.svg` files.

Exported icons keep the licence of the set they come from.

## How it works

1. Every stroke is redrawn exactly one grid pixel wide, with square caps and mitred joins.
2. The icon is rasterised with [resvg](https://github.com/RazrFalcon/resvg) and downsampled to the grid.
3. Any pixel whose coverage reaches the ink threshold is filled.
4. Horizontal runs of filled pixels are merged into a single path.

Icons drawn with fixed colours, such as emoji and logos, keep them. Each pixel takes the closest colour from the icon's own palette. Icons drawn in `currentColor` stay single-colour, so you can recolour them.

Outline sets that use strokes come out best, e.g. Lucide, Tabler and Feather. Filled sets look heavier and lose some detail.

## Not on npm (yet)

The core in [`src/core.ts`](src/core.ts) has no dependencies and works with any renderer. If you'd like it as a package, for example to generate sprites at build time or as an Astro or Vite integration, [open an issue](https://github.com/sirlisko/iconify-pixel/issues).

## Development

```sh
npm install
npm run dev        # the page
npm test           # vitest
npm run typecheck
npm run build      # static site into site/
npm run sheet      # full-set contact sheets into out/ (--ink=<n>)
npm run parity     # compares the core against the sharp pipeline it started from
```

Pushes to `main` deploy the page to GitHub Pages.
