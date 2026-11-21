import { defineConfig } from 'vite';

// Un seul build sert aux deux cibles :
// - GitHub Pages (index.html + assets, données de démo)
// - PrestaShop (le module slimroom charge assets/room.js et assets/room.css)
// D'où les noms de fichiers fixes et les chemins relatifs.
// room.js et room.css gardent un nom fixe (le module PrestaShop en a besoin et
// leur ajoute lui-même un numéro de version). Dans index.html, utilisé par la
// démo, on leur ajoute donc aussi un numéro qui change à chaque build : sans
// lui, le navigateur resservirait l'ancienne version après une publication.
const version = Date.now().toString(36);
const cacheBust = {
  name: 'cache-bust',
  transformIndexHtml: (html: string) => html.replace(/(assets\/room\.(?:js|css))"/g, `$1?v=${version}"`),
};

// Seconde page de la démo : dedans.html, la même page avec la vue intérieure.
// C'est une copie d'index.html où #app porte data-view="inside" (lu par main.ts).
const insidePage = {
  name: 'inside-page',
  enforce: 'post' as const,
  generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
    const index = bundle['index.html'];
    if (index?.type !== 'asset' || typeof index.source !== 'string') return;
    (this as unknown as { emitFile(file: { type: 'asset'; fileName: string; source: string }): void }).emitFile({
      type: 'asset',
      fileName: 'dedans.html',
      source: index.source.replace('<div id="app"', '<div id="app" data-view="inside"'),
    });
  },
};

export default defineConfig({
  base: './',
  plugins: [cacheBust, insidePage],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/room.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (asset) =>
          asset.names?.[0]?.endsWith('.css') ? 'assets/room.css' : 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
