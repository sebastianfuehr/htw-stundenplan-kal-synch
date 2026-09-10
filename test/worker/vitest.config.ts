import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2026-08-22',
        kvNamespaces: ['CAL'],
        bindings: { CRAWL_TOKEN: 'test-token-aaaaaaaaaaaaaaaaaaaa' },
      },
      wrangler: { configPath: '../../wrangler.jsonc' },
    }),
  ],
  test: {
    name: 'worker',
    include: ['**/*.test.ts'],
  },
});
