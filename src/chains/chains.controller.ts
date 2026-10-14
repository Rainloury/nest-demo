import { Controller, Post, Body } from '@nestjs/common';
import { ChainsService } from './chains.service.ts';

@Controller('chains')
export class ChainsController {
  constructor(private readonly chainsService: ChainsService) {}

  @Post('polish')
  polishArticle(@Body() body: { article: string }) {
    return this.chainsService.polishArticle(body.article);
  }

  @Post('blog')
  generateBlog(@Body() body: { keywords: string; style: string }) {
    return this.chainsService.generateBlog(body.keywords, body.style);
  }

  @Post('router')
  smartRouter(@Body() body: { question: string }) {
    return this.chainsService.smartRouter(body.question);
  }
}
