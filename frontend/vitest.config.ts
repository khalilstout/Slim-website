// Tests unitaires (tests/unit). Lancer : npm test
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // jsdom fournit document et localStorage, comme dans un navigateur.
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      // La 3D et l'interface sont couvertes par les tests de bout en bout (tests/e2e).
      include: ['src/shop.ts', 'src/zones.ts', 'src/config.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 85, functions: 85, branches: 75 },
    },
  },
});
