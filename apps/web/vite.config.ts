import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // `@iamin/engine` est un paquet du dépôt compilé en CommonJS : Vite doit le convertir.
  optimizeDeps: { include: ['@iamin/engine'] },
  build: {
    // Aucune ressource intégrée au CSS en `data:` : la CSP de production (`font-src 'self'`,
    // voir deploy/Caddyfile) les refuserait. Les polices restent des fichiers servis par l'origine.
    assetsInlineLimit: 0,
    commonjsOptions: { include: [/node_modules/, /packages[\\/]engine[\\/]dist/] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
