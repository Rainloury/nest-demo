import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.ts';
import { UserService } from './user.service.ts';

/**
 * 用**真实**的错误类构造 P2002。
 * 生成的 client 与 @prisma/client/runtime/client 复用同一个
 * PrismaClientKnownRequestError，所以 service 里的 instanceof 判定与生产完全一致，
 * 同时避免在测试里 import src/generated（AGENTS.md 7）。
 */
function uniqueConflict(meta: Record<string, unknown>): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta,
  });
}

type PrismaMock = {
  user: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    count: Mock;
    update: Mock;
    delete: Mock;
  };
  $transaction: Mock;
};

function createPrismaMock(): PrismaMock {
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // service 用数组形式事务一次性下发 count + findMany，这里用等价的并发实现
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

/** 取第 n 次调用的第一个入参，避免到处写 mock.calls[0][0] 这种无类型访问 */
function argOf<T>(fn: Mock, callIndex = 0): T {
  return fn.mock.calls[callIndex]?.[0] as T;
}

/** 抓出异步抛出的异常，并断言它是 Nest 的 HttpException 子类 */
async function captureError(run: () => Promise<unknown>): Promise<HttpException> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

const createDto = { name: '张三', email: 'zhang@example.com', password: 'secret', role: 'admin' as const };

describe('UserService', () => {
  let prisma: PrismaMock;
  let service: UserService;

  beforeEach(() => {
    prisma = createPrismaMock();
    // 只 new Service，Prisma 全部用假对象，绝不连真实数据库（AGENTS.md 7）
    service = new UserService(prisma as unknown as PrismaService);
  });

  describe('createUser', () => {
    it('创建成功时返回统一响应体，并把入参透传给 Prisma', async () => {
      prisma.user.create.mockResolvedValue({ id: 1, name: createDto.name, email: createDto.email, role: 'admin' });

      const result = await service.createUser(createDto);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(argOf(prisma.user.create)).toEqual({
        data: { name: '张三', email: 'zhang@example.com', password: 'secret', role: 'admin' },
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('创建用户成功');
      expect(result.data).toEqual({ id: 1, name: '张三', email: 'zhang@example.com', role: 'admin' });
      expect(typeof result.timestamp).toBe('string');
    });

    it('未传 role 时回落到 schema 默认值 user', async () => {
      prisma.user.create.mockResolvedValue({ id: 2 });

      await service.createUser({ name: '李四', email: 'li@example.com', password: 'p' } as typeof createDto);

      expect(argOf<{ data: { role: string } }>(prisma.user.create).data.role).toBe('user');
    });

    it('邮箱重复（P2002 且 meta.target 指向 email）转成 409，提示可读', async () => {
      prisma.user.create.mockRejectedValue(uniqueConflict({ target: ['email'] }));

      const error = await captureError(() => service.createUser(createDto));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        success: false,
        message: `邮箱 ${createDto.email} 已被注册`,
      });
    });

    it('P2002 的 meta 是 Prisma 7 + driver adapter 结构时也能认出 email', async () => {
      prisma.user.create.mockRejectedValue(
        uniqueConflict({
          driverAdapterError: {
            cause: {
              originalMessage: 'duplicate key value violates unique constraint "users_email_key"',
              constraint: { index: 'users_email_key' },
            },
          },
        }),
      );

      const error = await captureError(() => service.createUser(createDto));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ message: `邮箱 ${createDto.email} 已被注册` });
    });

    it('P2002 但识别不出具体字段时返回通用冲突提示', async () => {
      prisma.user.create.mockRejectedValue(uniqueConflict({ target: ['name'] }));

      const error = await captureError(() => service.createUser(createDto));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ success: false, message: '数据已存在，违反唯一约束' });
    });

    it('非 Prisma 异常原样抛出，交给全局异常过滤器处理', async () => {
      const boom = new Error('数据库连接中断');
      prisma.user.create.mockRejectedValue(boom);

      await expect(service.createUser(createDto)).rejects.toBe(boom);
    });
  });

  describe('getUserList', () => {
    beforeEach(() => {
      prisma.user.count.mockResolvedValue(25);
      prisma.user.findMany.mockResolvedValue([{ id: 1, name: '张三' }]);
    });

    it('默认第 1 页、每页 10 条，skip 从 0 起算并按下发时间倒序', async () => {
      const result = await service.getUserList({});

      const args = argOf<{ skip: number; take: number; orderBy: unknown }>(prisma.user.findMany);
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
      expect(args.orderBy).toEqual({ createdAt: 'desc' });

      expect(result.pagination).toEqual({
        page: 1,
        size: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      });
      expect(result.list).toEqual([{ id: 1, name: '张三' }]);
    });

    it('size 超过上限 100 时被钳制，避免一次拉全表', async () => {
      const result = await service.getUserList({ page: 3, size: 999 });

      const args = argOf<{ skip: number; take: number }>(prisma.user.findMany);
      expect(args.take).toBe(100);
      expect(args.skip).toBe(200);
      expect(result.pagination).toMatchObject({ page: 3, size: 100 });
    });

    it('非法分页参数回落到默认值（NaN / 0 都不该直接进 Prisma）', async () => {
      await service.getUserList({ page: Number('abc'), size: 0 });

      const args = argOf<{ skip: number; take: number }>(prisma.user.findMany);
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
    });

    it('name 走模糊匹配、role 走等值匹配，且 count 与 findMany 用同一个 where', async () => {
      await service.getUserList({ name: '张', role: 'admin' });

      const where = argOf<{ where: unknown }>(prisma.user.count).where;
      expect(where).toEqual({ name: { contains: '张', mode: 'insensitive' }, role: 'admin' });
      expect(argOf<{ where: unknown }>(prisma.user.findMany).where).toEqual(where);
    });

    it('count 与 findMany 放在同一个事务里下发，保证同一快照', async () => {
      await service.getUserList({});

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const operations = argOf<unknown[]>(prisma.$transaction);
      expect(Array.isArray(operations)).toBe(true);
      expect(operations).toHaveLength(2);
    });

    it('列表查询的 select 不含 password（脱敏）', async () => {
      await service.getUserList({});

      const select = argOf<Record<string, unknown>>(prisma.user.findMany).select;
      expect(select).not.toHaveProperty('password');
      expect(select).toMatchObject({ id: true, name: true, email: true, role: true });
    });
  });

  describe('getUserById', () => {
    it.each([Number('abc'), 0, -1, 1.5])('非法 id %s 在进库前被拦成 400', async (id) => {
      const error = await captureError(() => service.getUserById(id));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('查不到记录时抛 404 而不是 500', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.getUserById(42));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ success: false, message: '用户 42 不存在' });
    });

    it('查询成功时返回用户及其文章，且不含 password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7, name: '李四', posts: [{ id: 1, title: 'p' }] });

      const result = await service.getUserById(7);

      expect(result.success).toBe(true);
      expect(result.message).toBe('获取用户7成功');
      expect(result.data).toEqual({ id: 7, name: '李四', posts: [{ id: 1, title: 'p' }] });

      const args = argOf<{ where: { id: number }; select: Record<string, unknown> }>(prisma.user.findUnique);
      expect(args.where).toEqual({ id: 7 });
      expect(args.select).not.toHaveProperty('password');
      expect(args.select).toHaveProperty('posts');
    });
  });

  describe('updateUser', () => {
    it('用户不存在时抛 404，且不执行更新', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.updateUser(9, { name: '新名字' }));

      expect(error.getStatus()).toBe(404);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('更新成功时返回统一响应体，且 select 不含 password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9 });
      prisma.user.update.mockResolvedValue({ id: 9, name: '新名字' });

      const result = await service.updateUser(9, { name: '新名字' });

      expect(argOf(prisma.user.update)).toEqual({
        where: { id: 9 },
        data: { name: '新名字' },
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      });
      expect(result.message).toBe('更新用户9成功');
      expect(result.data).toEqual({ id: 9, name: '新名字' });
    });

    it('改成已存在的邮箱时 P2002 转 409', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9 });
      prisma.user.update.mockRejectedValue(uniqueConflict({ target: ['email'] }));

      const error = await captureError(() => service.updateUser(9, { email: 'taken@example.com' }));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ message: '邮箱 taken@example.com 已被注册' });
    });
  });

  describe('removeUser', () => {
    it('用户不存在时抛 404，且不执行删除', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.removeUser(5));

      expect(error.getStatus()).toBe(404);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('删除成功时只返回成功标记，不返回 data', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5 });
      prisma.user.delete.mockResolvedValue({ id: 5 });

      const result = await service.removeUser(5);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(result).toMatchObject({ success: true, message: '删除用户5成功' });
      expect(result).not.toHaveProperty('data');
    });
  });
});
