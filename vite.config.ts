import { defineConfig } from "vite";

export default defineConfig({
	root: "demo",
	base: "/iconify-pixel/",
	build: { outDir: "../site", emptyOutDir: true },
});
