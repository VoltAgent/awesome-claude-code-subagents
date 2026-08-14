import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30_000,
    // Real hardware tests must run one file at a time to avoid
    // overwhelming the embedded device's rate limiter.
    fileParallelism: false,
  },
});
