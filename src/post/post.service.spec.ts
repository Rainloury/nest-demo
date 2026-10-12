import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.ts';
import { PostService } from './post.service.ts';

type PrismaMock = {
  user: { findUnique: Mock };
  post: { create: Mock; findMany: Mock; findUnique: Mock; update: Mock; delete: Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    user: { findUnique: vi.fn() },
    post: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

/** 取第 n 次调用的第一个入参 */
function argOf<T>(fn: Mock, callIndex = 0): T {
  return fn.mock.calls[callIndex]?.[0] as T;
}

async function captureError(run: () => Promise<unknown>): Promise<HttpException> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe('PostService', () => {
  let prisma: PrismaMock;
  let service: PostService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PostService(prisma as unknown as PrismaService);
  });

  describe('createPost', () => {
    const dto = { title: '标题', content: '正文', authorId: 1 };

    it.each(['abc', 0, -1, 1.5, undefined])('authorId 为 %s 时在进库前拦成 400', async (raw) => {
      const error = await captureError(() =>
        service.createPost({ ...dto, authorId: raw as unknown as number }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('作者不存在时抛 404，且不落库', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.createPost(dto));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: '作者 1 不存在' });
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('创建成功：外键用 author.connect、published 默认 false、作者字段不含 password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, name: '张三' });
      prisma.post.create.mockResolvedValue({ id: 10, title: '标题' });

      const result = await service.createPost(dto);

      const args = argOf<{
        data: Record<string, unknown>;
        include: { author: { select: Record<string, unknown> } };
      }>(prisma.post.create);

      // 标量外键 authorId 只能是数字，关系字段 author 才接 { connect }
      expect(args.data).toMatchObject({
        title: '标题',
        content: '正文',
        published: false,
        author: { connect: { id: 1 } },
      });
      expect(args.include.author.select).not.toHaveProperty('password');

      expect(result.success).toBe(true);
      expect(result.message).toBe('创建文章成功');
      expect(result.data).toEqual({ id: 10, title: '标题' });
    });

    it('显式传 published: true 时按请求落库', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.post.create.mockResolvedValue({ id: 11 });

      await service.createPost({ ...dto, published: true });

      expect(argOf<{ data: { published: boolean } }>(prisma.post.create).data.published).toBe(true);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.post.findMany.mockResolvedValue([{ id: 1, title: '标题' }]);
    });

    it('不传 published 时不过滤', async () => {
      const result = await service.findAll();

      expect(argOf<{ where: unknown }>(prisma.post.findMany).where).toEqual({});
      expect(result.message).toBe('获取文章列表成功');
      expect(result.data).toEqual([{ id: 1, title: '标题' }]);
    });

    it.each([
      { raw: 'true', expected: true },
      { raw: 'false', expected: false },
    ])('published 为 $raw 时按 $expected 过滤', async ({ raw, expected }) => {
      await service.findAll(raw);

      expect(argOf<{ where: unknown }>(prisma.post.findMany).where).toEqual({ published: expected });
    });

    it.each(['1', 'TRUE', '', 'yes'])('published 为 %s（无法识别）时不过滤', async (raw) => {
      await service.findAll(raw);

      expect(argOf<{ where: unknown }>(prisma.post.findMany).where).toEqual({});
    });

    it('列表带出作者时排除 password，并按创建时间倒序', async () => {
      await service.findAll();

      const args = argOf<{
        include: { author: { select: Record<string, unknown> } };
        orderBy: unknown;
      }>(prisma.post.findMany);

      expect(args.include.author.select).not.toHaveProperty('password');
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('findByAuthor', () => {
    it('按 authorId 过滤，作者无文章时返回空列表而不是 404', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.findByAuthor(3);

      expect(argOf<{ where: unknown }>(prisma.post.findMany).where).toEqual({ authorId: 3 });
      expect(result.data).toEqual([]);
      expect(result.message).toBe('获取作者3的文章成功');
    });
  });

  describe('findOne', () => {
    it('文章不存在时抛 404', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.findOne(99));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: '文章 99 不存在' });
    });

    it('查询成功时返回文章与作者公开字段', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 7, title: '标题' });

      const result = await service.findOne(7);

      expect(result).toMatchObject({ success: true, message: '获取文章7成功' });
      expect(result.data).toEqual({ id: 7, title: '标题' });
    });
  });

  describe('update', () => {
    it('文章不存在时抛 404，且不执行更新', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.update(8, { title: '新标题' }));

      expect(error.getStatus()).toBe(404);
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('只提交声明过的字段：未传的字段不会进 data（防 body 混入未知键）', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 8 });
      prisma.post.update.mockResolvedValue({ id: 8, title: '新标题' });

      await service.update(8, { title: '新标题' });

      const args = argOf<{ where: unknown; data: Record<string, unknown> }>(prisma.post.update);
      expect(args.where).toEqual({ id: 8 });
      expect(args.data).toEqual({ title: '新标题' });
      expect(args.data).not.toHaveProperty('published');
      expect(args.data).not.toHaveProperty('content');
    });

    it('三个字段都传时全部进 data', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 8 });
      prisma.post.update.mockResolvedValue({ id: 8 });

      await service.update(8, { title: 't', content: 'c', published: true });

      expect(argOf<{ data: unknown }>(prisma.post.update).data).toEqual({
        title: 't',
        content: 'c',
        published: true,
      });
    });
  });

  describe('publish', () => {
    it('文章不存在时抛 404', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.publish(6));

      expect(error.getStatus()).toBe(404);
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('发布成功时把 published 置为 true', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 6 });
      prisma.post.update.mockResolvedValue({ id: 6, published: true });

      const result = await service.publish(6);

      expect(argOf<{ where: unknown; data: unknown }>(prisma.post.update)).toEqual({
        where: { id: 6 },
        data: { published: true },
        include: { author: { select: { id: true, name: true, email: true, role: true } } },
      });
      expect(result.data).toEqual({ id: 6, published: true });
      expect(result.message).toBe('文章6已发布');
    });
  });

  describe('remove', () => {
    it('文章不存在时抛 404，且不执行删除', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const error = await captureError(() => service.remove(4));

      expect(error.getStatus()).toBe(404);
      expect(prisma.post.delete).not.toHaveBeenCalled();
    });

    it('删除成功时只返回成功标记，不返回 data', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 4 });
      prisma.post.delete.mockResolvedValue({ id: 4 });

      const result = await service.remove(4);

      expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 4 } });
      expect(result).toMatchObject({ success: true, message: '删除文章4成功' });
      expect(result).not.toHaveProperty('data');
    });
  });
});
