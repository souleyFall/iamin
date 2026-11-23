import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // `@iamin/engine` est un paquet du dépôt compilé en CommonJS : Vite doit le convertir.
  optimizeDeps: { include: ['@iamin/engine'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages[\\/]engine[\\/]dist/] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
