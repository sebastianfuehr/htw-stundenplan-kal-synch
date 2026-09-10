import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Unit tests: parsers, dates, ICS, selection. Plain Node, no Workers runtime.
        test: {
          name: 'unit',
          include: ['test/*.test.ts'],
        },
      },
      './test/worker/vitest.config.ts',
    ],
  },
});
