import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    globals: true,
    // Increase timeout for complex integration tests
    testTimeout: 30000,
    // Coverage configuration
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/**/__tests__/**',
      ],
    },
  },
});
