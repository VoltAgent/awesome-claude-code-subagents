import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // CLI tests may need longer timeout
    testTimeout: 10000,
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
        'src/wasm/**',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    // Performance benchmarks
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
  },
});
