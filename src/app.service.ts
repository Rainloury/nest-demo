import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.ts';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 健康检查只验证应用进程和数据库连接是否可用。
   * 不返回数据库版本、连接串等内部信息，避免无意中暴露部署细节。
   */
  async checkHealth() {
    const checkedAt = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        success: true,
        message: '服务健康',
        timestamp: checkedAt,
        data: {
          status: 'ok',
          database: 'up',
          uptime: process.uptime(),
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`健康检查失败：${reason}`);

      throw new ServiceUnavailableException({
        success: false,
        message: '服务不可用',
        timestamp: checkedAt,
        data: {
          status: 'error',
          database: 'down',
        },
      });
    }
  }
}
