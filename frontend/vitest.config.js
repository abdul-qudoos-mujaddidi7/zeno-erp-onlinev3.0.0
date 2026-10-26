import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    /* The compile-level guards run the Svelte compiler on whole pages, which
       takes ~1.5s alone and can pass 5s when the workers share the machine. */
    testTimeout: 20000,
  },
});
