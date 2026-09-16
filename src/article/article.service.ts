import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateArticleDto } from './dto/create-article.dto.ts';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  async getArticleList() {
    const result = await this.prisma.article.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { message: 'success', data: result };
  }

  async getArticleById(id: number) {
    return await this.prisma.article.findUnique({ where: { id } });
  }

  async createArticle(dto: CreateArticleDto) {
    return await this.prisma.article.create({
      data: {
        title: dto.title,
        content: dto.content,
        author: dto.author,
      },
    });
  }
}
