import { defineConfig } from 'vite';

// Un seul build sert aux deux cibles :
// - GitHub Pages (index.html + assets, données de démo)
// - PrestaShop (le module slimroom charge assets/room.js et assets/room.css)
// D'où les noms de fichiers fixes et les chemins relatifs.
export default defineConfig({
  base: './',
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
