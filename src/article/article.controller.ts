import { Controller, Get, Param, Body, Post, ParseIntPipe } from '@nestjs/common';
import { ArticleService } from './article.service.ts';
import { CreateArticleDto } from './dto/create-article.dto.ts';
@Controller('article')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}
  @Get('list')
  getArticleList() {
    return this.articleService.getArticleList();
  }
  @Get('list/:id')
  getArticleById(@Param('id', ParseIntPipe) id: number) {
    return this.articleService.getArticleById(id);
  }

  @Post('create')
  createArticle(@Body() dto: CreateArticleDto) {
    return this.articleService.createArticle(dto);
  }
}
