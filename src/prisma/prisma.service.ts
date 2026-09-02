import { config as loadEnv } from 'dotenv';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

// 与 prisma.config.ts 保持一致：dotenv 的 "./config" 子路径导出没有类型声明，
// nodenext 下副作用导入会报 TS2882，改为显式调用 config()。
loadEnv();

/**
 * Prisma 7 官方用法：driver adapter 由 @prisma/adapter-pg 提供，
 * 传 { connectionString } 即可（不需要自己 new Pool()）。
 * 注意：此文件与运行时都依赖 .env 里的 DATABASE_URL，故顶部加载 dotenv。
 */
/** 把连接串里的密码打码，安全地打印目标地址 */
function maskUrl(url: string): string {
  return url.replace(/\/\/([^/@]*):([^@]*)@/, '//$1:***@');
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // dotenv 找不到 .env 时会静默跳过，不抛错。
    // 若不校验，pg 会回落到默认的 localhost:5432，报错只给一个空 message 的
    // ECONNREFUSED，极难定位 —— 所以这里必须 fail fast。
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error(
        `DATABASE_URL 未设置。请在项目根目录 ${process.cwd()} 创建 .env（` +
          `参考 .env.example）。dotenv 找不到文件时不会报错，只会静默跳过。`,
      );
    }
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
    this.logger.log(`Prisma 目标数据库：${maskUrl(url)}`);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma 已连接数据库');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
