import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages serves a project site from /<repo>/, so every asset URL
    // needs that prefix. Applied in dev and preview too, not just builds: if
    // this only took effect for `build`, the dev server would serve from `/`
    // and quietly hide every path bug until it reached production.
    // Override with BASE_PATH=/ for a custom domain or a root-hosted deploy.
    base: process.env.BASE_PATH ?? '/class_points/',
    // Stamped into the bundle so the app can tell the user which build they are
    // actually running. Without it, "it's showing the old version" is a report
    // nobody can confirm or deny.
    define: {
      __BUILD_ID__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
