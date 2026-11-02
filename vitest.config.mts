import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests cover the pure TypeScript modules (engine, content, monetization, policy).
// They never import React Native, so they run in plain Node.
// `npm run content:sample` prints sample items for a human content reviewer.
const sampling = process.env.CONTENT_SAMPLE === '1';

export default defineConfig({
  test: {
    include: sampling ? ['src/dev/**/*.test.ts'] : ['src/**/*.test.ts'],
    exclude: sampling ? [] : ['src/dev/**', 'node_modules/**'],
    environment: 'node',
    // The deep content audit (SEEDS=200) enumerates every digit fill for build-from-scratch items.
    testTimeout: 180000,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
