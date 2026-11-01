import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/**
 * Each Phosphor icon ships six weights; the app uses regular, bold and fill only. Dropping
 * thin, light and duotone from every icon definition cuts the start-up bundle. A weight
 * dropped here renders nothing, so add it back to KEEP before using it.
 */
const KEEP_WEIGHTS = new Set(['regular', 'bold', 'fill']);
function phosphorWeights(): Plugin {
  return {
    name: 'phosphor-weights',
    enforce: 'pre',
    transform(code, id) {
      if (!/@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/].+\.es\.js$/.test(id)) return null;
      let kept = 0;
      const out = code.replace(/\[\s*"(\w+)",[\s\S]*?\n {2}\],?\n?/g, (entry, weight: string) => {
        if (KEEP_WEIGHTS.has(weight)) {
          kept++;
          return entry;
        }
        return '';
      });
      // Phosphor changed its file layout: fail loudly rather than ship blank icons.
      if (kept !== KEEP_WEIGHTS.size)
        throw new Error(`phosphor-weights: unexpected format in ${id}`);
      return { code: out, map: null };
    },
  };
}

// GitHub Pages serves a project site at /voice-notes/. Local dev, preview and e2e use /.
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    phosphorWeights(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      devOptions: { enabled: false },
      manifest: {
        name: 'Voice Notes',
        short_name: 'Voice Notes',
        description: 'Private voice notes. Transcribed on your device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f4f2ec',
        theme_color: '#f4f2ec',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // In prompt mode the plugin leaves this off. Without it the new worker never claims the
        // open page after Reload, so no controllerchange fires and the page never reloads.
        clientsClaim: true,
      },
    }),
  ],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4391, strictPort: true },
});
