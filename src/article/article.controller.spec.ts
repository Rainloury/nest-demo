import { Test, TestingModule } from '@nestjs/testing';
import { ArticleController } from './article.controller.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { ArticleService } from './article.service.ts';

const mockPrisma = {
  article: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 1, title: '标题', content: '内容', author: null }),
  },
};

describe('ArticleController', () => {
  let controller: ArticleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticleController],
      providers: [ArticleService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<ArticleController>(ArticleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
