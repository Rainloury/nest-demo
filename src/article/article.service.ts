import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateArticleDto } from './dto/create-article.dto.ts';

@Injectable()
export class ArticleService {
  constructor(private readonly prisma: PrismaService) {}

  getArticleList() {
    return this.prisma.article.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  getArticleById(id: number) {
    return this.prisma.article.findUnique({ where: { id } });
  }

  createArticle(dto: CreateArticleDto) {
    return this.prisma.article.create({
      data: {
        title: dto.title,
        content: dto.content,
        author: dto.author,
      },
    });
  }
}
