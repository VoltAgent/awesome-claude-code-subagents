import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      '__tests__/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
