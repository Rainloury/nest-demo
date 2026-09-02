import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.ts';
import { PrismaService } from './../src/prisma/prisma.service.ts';

// AppModule 注册了 PrismaModule，e2e 启动时 onModuleInit 会 $connect() 连真实数据库。
// 用假的 PrismaService 顶掉，保证 e2e 不依赖外部数据库是否可达。
const mockPrisma = {
  article: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 1 }),
  },
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
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

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
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
