import { PrismaService } from './prisma.service.ts';

/**
 * 只测「配置守卫」：DATABASE_URL 缺失必须在构造时 fail fast。
 * 这里刻意不调用 $connect()，所以不会碰到真实数据库（AGENTS.md 7）。
 */
describe('PrismaService', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('未设置 DATABASE_URL 时直接抛错，而不是让 pg 回落到 localhost', () => {
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(/DATABASE_URL 未设置/);
  });

  it('配置齐全时可以构造实例（构造阶段不发起连接）', () => {
    process.env.DATABASE_URL = 'postgresql://tester:secret@127.0.0.1:5432/nowhere';

    const service = new PrismaService();

    // PrismaClient 内部用了 Proxy，对它调 toBeInstanceOf 会走 getPrototypeOf 递归到栈溢出，
    // 所以改为断言生命周期钩子可用——能拿到就说明构造成功且未抛错。
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
  });
});
