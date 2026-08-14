import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    globals: true,
    // Bumped from default 5s → 30s to match v3/vitest.config.ts.
    // guidance-provider's "block stopping when too many unconsolidated"
    // test cold-loads ReasoningBank patterns + HuggingFace embeddings,
    // which exceed 15s in CI without warm cache.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Disable coverage for hooks package (uses vitest v2)
    coverage: {
      enabled: false,
    },
  },
});
