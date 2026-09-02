import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// 加载 .env 到 process.env，供下方 env('DATABASE_URL') 使用。
// 显式调用 config() 与 `import 'dotenv/config'` 语义等价，
// 但只依赖主入口类型声明，规避子路径导出类型缺失导致的 TS2882。
loadEnv();

export default defineConfig({
  // 数据模型定义文件
  schema: 'prisma/schema.prisma',
  // 每次执行 prisma migrate dev，生成的 SQL 文件存放在这里
  migrations: {
    path: 'prisma/migrations',
  },
  // 数据库连接配置
  datasource: {
    url: env('DATABASE_URL'),
  },
});
