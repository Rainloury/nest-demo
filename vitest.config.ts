import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // 跳过 Prisma 生成代码目录。src/generated/prisma 有数千行生成文件，
    // 扫描+转译会把 import 阶段拖到 260s+，导致 beforeEach 默认的 10s 钩子超时。
    // （若将来用 `nest g library` 引入 tsconfig paths 别名，
    //   再把 vite-tsconfig-paths 插件加回 plugins 即可。）
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
    // NestJS 的 Test.createTestingModule().compile() 要扫描装饰器元数据，
    // 冷启动单次可到 15s+（实测：一个 expect(service).toBeDefined() 耗时 15.3s），
    // 默认的 hookTimeout/testTimeout 只有 10s，会把「慢」误判成「失败」。
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
