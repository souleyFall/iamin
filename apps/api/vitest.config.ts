import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le premier test charge le client Prisma généré : on laisse de la marge aux machines lentes.
    testTimeout: 30_000,
  },
});
