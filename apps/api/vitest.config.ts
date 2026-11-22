import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le premier test charge le client Prisma généré : on laisse de la marge aux machines lentes.
    testTimeout: 30_000,
    // Les tests d'intégration partagent une seule base de test et la vident avant chaque test :
    // les fichiers s'exécutent donc l'un après l'autre, jamais en parallèle.
    fileParallelism: false,
  },
});
