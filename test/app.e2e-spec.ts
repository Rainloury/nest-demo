import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.ts';
import { PrismaService } from './../src/prisma/prisma.service.ts';

// AppModule 注册了 PrismaModule，e2e 启动时 onModuleInit 会 $connect() 连真实数据库。
// 用假的 PrismaService 顶掉，保证 e2e 不依赖外部数据库是否可达。
const mockPrisma = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
};

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          message: '服务健康',
          data: {
            status: 'ok',
            database: 'up',
          },
        });
      });
  });

  it('/user/user (GET)', () => {
    return request(app.getHttpServer())
      .get('/user/user?page=1&size=10')
      .expect(200)
      .expect({ page: 1, size: 10, total: 100, message: '第 1 页，每页 10 条' });
  });

  afterEach(async () => {
    await app.close();
  });
});
