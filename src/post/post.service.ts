import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreatePostDto } from './dto/create-post.dto.ts';
import { UpdatePostDto } from './dto/update-post.dto.ts';

/**
 * 关联作者的对外字段白名单。
 * 只要 include author，就必须显式 select，否则会把 User.password 一起返回给前端（AGENTS.md 6.4）。
 */
const AUTHOR_PUBLIC_SELECT = { id: true, name: true, email: true, role: true } as const;

/** 统一的「记录不存在」异常体，避免每个方法重复拼时间戳（形状见 AGENTS.md 6.1） */
function notFound(message: string): NotFoundException {
  return new NotFoundException({ success: false, message, timestamp: new Date().toISOString() });
}

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建文章
  async createPost(dto: CreatePostDto) {
    // body 没有全局 ValidationPipe（AGENTS.md 12），authorId 可能是字符串或缺失；
    // Number('abc') 得到 NaN，直接丢给 Prisma 只会得到一个难懂的参数错误，这里前置拦掉。
    const authorId = Number(dto.authorId);
    if (!Number.isInteger(authorId) || authorId <= 0) {
      throw new BadRequestException({
        success: false,
        message: `authorId "${dto.authorId}" 非法，应为正整数`,
        timestamp: new Date().toISOString(),
      });
    }

    const author = await this.prisma.user.findUnique({ where: { id: authorId } });
    if (!author) {
      // 原实现抛裸 Error，会变成 500 并把堆栈暴露给客户端；按 6.2 转成 404
      throw notFound(`作者 ${authorId} 不存在`);
    }

    const post = await this.prisma.post.create({
      data: {
        title: dto.title,
        content: dto.content,
        published: dto.published ?? false,
        // connect 只能用在「关系字段」author 上；
        // 标量外键 authorId 的类型是 number，不能塞 { connect: ... }
        author: { connect: { id: authorId } },
      },
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
    });

    return {
      success: true,
      message: '创建文章成功',
      timestamp: new Date().toISOString(),
      data: post,
    };
  }

  // 获取文章列表（published 只认 'true' / 'false'，未传或无法识别时不过滤）
  async findAll(published?: string) {
    // 用显式分支代替两层嵌套三元：三个结果各自可读，以后要叠加过滤条件也好扩展
    const where: Prisma.PostWhereInput = {};
    if (published === 'true') where.published = true;
    else if (published === 'false') where.published = false;

    const posts = await this.prisma.post.findMany({
      where,
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: '获取文章列表成功',
      timestamp: new Date().toISOString(),
      data: posts,
    };
  }

  // 按作者查文章：作者不存在时返回空列表，不做额外一次存在性查询
  async findByAuthor(authorId: number) {
    const posts = await this.prisma.post.findMany({
      where: { authorId },
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: `获取作者${authorId}的文章成功`,
      timestamp: new Date().toISOString(),
      data: posts,
    };
  }

  // 获取文章详情
  async findOne(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
    });
    if (!post) {
      throw notFound(`文章 ${id} 不存在`);
    }

    return {
      success: true,
      message: `获取文章${id}成功`,
      timestamp: new Date().toISOString(),
      data: post,
    };
  }

  // 更新文章
  async update(id: number, dto: UpdatePostDto) {
    const exists = await this.prisma.post.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw notFound(`文章 ${id} 不存在`);
    }

    // 项目没有启用全局 ValidationPipe，dto 只是编译期标注、运行时不生效；
    // 这里显式挑字段，避免 body 里混入 authorId 之类的未知键让 Prisma 抛错变成 500。
    const data: Prisma.PostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.published !== undefined) data.published = dto.published;

    const post = await this.prisma.post.update({
      where: { id },
      data,
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
    });

    return {
      success: true,
      message: `更新文章${id}成功`,
      timestamp: new Date().toISOString(),
      data: post,
    };
  }

  // 发布文章（幂等：已发布再调用仍返回成功）
  async publish(id: number) {
    const exists = await this.prisma.post.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw notFound(`文章 ${id} 不存在`);
    }

    const post = await this.prisma.post.update({
      where: { id },
      data: { published: true },
      include: { author: { select: AUTHOR_PUBLIC_SELECT } },
    });

    return {
      success: true,
      message: `文章${id}已发布`,
      timestamp: new Date().toISOString(),
      data: post,
    };
  }

  // 删除文章
  async remove(id: number) {
    const exists = await this.prisma.post.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw notFound(`文章 ${id} 不存在`);
    }

    await this.prisma.post.delete({ where: { id } });

    return {
      success: true,
      message: `删除文章${id}成功`,
      timestamp: new Date().toISOString(),
    };
  }
}
