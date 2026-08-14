/**
 * V3 Test Setup
 * Global test configuration for Vitest
 */

import { beforeAll, afterAll, vi } from 'vitest';

// ── Native binding mocks ─────────────────────────────────────────────
// `sharp` is a transitive dep via @xenova/transformers + @huggingface/
// transformers. v3/package.json has `neverBuiltDependencies: ['sharp']`,
// so sharp's prebuilt binary is never fetched in CI. Any test that
// transitively pulls in transformers fails at module-load with
// 'Cannot find module ../build/Release/sharp-linux-x64.node'.
//
// No test in this suite actually exercises sharp's image-processing
// behavior — it's only ever a transitive bystander. Mock it as a no-op
// so module-load succeeds. If a test ever does need real sharp, it can
// override locally via vi.unmock('sharp').
vi.mock('sharp', () => ({
  default: () => {
    throw new Error('sharp is mocked in tests; install it in your project for real image processing');
  },
}));


// Mock console.warn for cleaner test output
beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Increase timeout for integration tests
vi.setConfig({
  testTimeout: 30000,
});
