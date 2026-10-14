import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { PrismaService } from './prisma/prisma.service.ts';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;
  const queryRaw = vi.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRaw },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  it('健康检查成功时返回 ok 和数据库 up', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await appController.checkHealth();

    expect(result).toMatchObject({
      success: true,
      message: '服务健康',
      data: {
        status: 'ok',
        database: 'up',
      },
    });
    expect(result.data.uptime).toEqual(expect.any(Number));
  });

  it('数据库检查失败时返回 503 结构化错误', async () => {
    queryRaw.mockRejectedValue(new Error('数据库连接失败'));

    await expect(appService.checkHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
