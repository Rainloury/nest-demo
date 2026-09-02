import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.ts';
import { ArticleService } from './article.service.ts';

// 用假的 PrismaService，避免单测真的去连数据库
const mockPrisma = {
  article: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockResolvedValue({ id: 1, title: '标题', content: '内容', author: null }),
  },
};

describe('ArticleService', () => {
  let service: ArticleService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArticleService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ArticleService>(ArticleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getArticleList 应按创建时间倒序查询', async () => {
    await service.getArticleList();
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('createArticle 应把 dto 字段写入 data', async () => {
    await service.createArticle({ title: '标题', content: '内容' });
    expect(mockPrisma.article.create).toHaveBeenCalledWith({
      data: { title: '标题', content: '内容', author: undefined },
    });
  });

  it('getArticleById 应把 id 作为唯一键查询', async () => {
    await service.getArticleById(7);
    expect(mockPrisma.article.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});
