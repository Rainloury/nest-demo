import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateUserDto } from './dto/create-user.dto.ts';
import { QueryUserDto } from './dto/query-user.dto.ts';
import { UpdateUserDto } from './dto/update-user.dto.ts';

/**
 * 唯一约束冲突（P2002）时，把“冲突的是哪个字段/索引”的线索汇总成一个字符串。
 * meta 的结构随 Prisma 版本/驱动适配器变化，这里不依赖固定路径：
 * - 经典引擎：meta.target = ['email']，或 meta.constraint = { index | fields }
 * - Prisma 7 + driver adapter：根级只有 driverAdapterError / modelName，
 *   真正的 PG 原始错误在 driverAdapterError.cause 里（constraint.index / originalMessage）
 * - 兜底：error.message 本身也带 ``Unique constraint failed on the constraint: `User_email_key` ``
 */
function collectConflictSignals(error: Prisma.PrismaClientKnownRequestError): string {
  const signals: string[] = [error.message];

  const pushString = (value: unknown) => {
    if (typeof value === 'string') signals.push(value);
    else if (Array.isArray(value)) signals.push(...value.map(String));
  };

  /** 约束对象：{ index: 'User_email_key' } 或 { fields: ['email'] } */
  const pushConstraint = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const c = value as Record<string, unknown>;
    pushString(c['index']);
    pushString(c['fields']);
    pushString(c['constraint']);
  };

  const meta = error.meta;
  if (meta) {
    pushString(meta['target']);
    pushConstraint(meta['constraint']);

    const adapterError = meta['driverAdapterError'] as { cause?: unknown } | undefined;
    const cause = adapterError?.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause === 'object') {
      pushString(cause['originalMessage']);
      pushString(cause['table']);
      pushConstraint(cause['constraint']);
    }
  }

  return signals.join(' | ').toLowerCase();
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建用户
  async createUser(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: dto.password,
          role: dto.role ?? 'user',
        },
      });
      return {
        success: true,
        message: '创建用户成功',
        timestamp: new Date().toISOString(),
        data: user,
      };
    } catch (error) {
      // email 上有 @unique，重复注册会抛 P2002，转成 409 而不是 500
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const signals = collectConflictSignals(error);
        if (signals.includes('email')) {
          throw new ConflictException({
            success: false,
            message: `邮箱 ${dto.email} 已被注册`,
            timestamp: new Date().toISOString(),
          });
        }
        throw new ConflictException({
          success: false,
          message: '数据已存在，违反唯一约束',
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }
  }

  async getUserList(query: QueryUserDto) {
    const currentPage = Number(query.page) || 1;
    const pageSize = Math.min(Number(query.size) || 10, 100);
    const skip = (currentPage - 1) * pageSize;

    const where: Prisma.UserWhereInput = {};
    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }
    if (query.role) {
      where.role = query.role;
    }

    // 数组形式的事务：count 与 findMany 在同一个事务里一次性下发，
    // 保证 total 和当前页数据来自同一个数据库快照（避免并发写入导致两者对不上）。
    const [total, list] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // password 不返回给前端
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      pagination: {
        page: currentPage,
        size: pageSize,
        total,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      list,
    };
  }

  async getUserById(id: number) {
    // 路由参数是 string，Number('abc') 会得到 NaN，
    // 直接丢给 Prisma 只会得到一个难懂的参数类型错误，这里先拦掉。
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException({
        success: false,
        message: `用户 ID "${id}" 非法，应为正整数`,
        timestamp: new Date().toISOString(),
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true, // 联表查询该用户的所有文章
        posts: {
          select: {
            id: true,
            title: true,
            published: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: `用户 ${userId} 不存在`,
        timestamp: new Date().toISOString(),
      });
    }
    return {
      success: true,
      message: `获取用户${id}成功`,
      timestamp: new Date().toISOString(),
      data: user,
    };
  }

  // 更新用户
  async updateUser(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: `用户 ${id} 不存在`,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: dto,
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      });
      return {
        success: true,
        message: `更新用户${id}成功`,
        timestamp: new Date().toISOString(),
        data: updatedUser,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const signals = collectConflictSignals(error);
        if (signals.includes('email')) {
          throw new ConflictException({
            success: false,
            message: `邮箱 ${dto.email} 已被注册`,
            timestamp: new Date().toISOString(),
          });
        }
        throw new ConflictException({
          success: false,
          message: '数据已存在，违反唯一约束',
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }
  }

  // 删除用户
  async removeUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: `用户 ${id} 不存在`,
        timestamp: new Date().toISOString(),
      });
    }
    await this.prisma.user.delete({ where: { id } });
    return {
      success: true,
      message: `删除用户${id}成功`,
      timestamp: new Date().toISOString(),
    };
  }
}
