import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { UserModule } from './user/user.module.ts';
import { ArticleModule } from './article/article.module.ts';
import { PrismaModule } from './prisma/prisma.module.ts';
import { ModelsModule } from './models/models.module.js';
import { PromptsModule } from './prompts/prompts.module.js';

export const { ObserveModule } = createObserveModule();

@Module({
  imports: [PrismaModule, UserModule, ArticleModule, ModelsModule, PromptsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
