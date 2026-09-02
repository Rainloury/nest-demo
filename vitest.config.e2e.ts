import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
    // e2e 要 boot 整个 Nest 应用（含 AppModule 的全部 import），比单测更慢，
    // 默认 10s 的 hookTimeout 必然超时。
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
