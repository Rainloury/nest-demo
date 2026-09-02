import { Module } from '@nestjs/common';
import { ArticleService } from './article.service.ts';
import { ArticleController } from './article.controller.ts';

@Module({
  controllers: [ArticleController],
  providers: [ArticleService],
  exports: [ArticleService],
})
export class ArticleModule {}
