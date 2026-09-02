import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { UserModule } from './user/user.module.ts';
import { ArticleModule } from './article/article.module.ts';
import { PrismaModule } from './prisma/prisma.module.ts';

export const { ObserveModule } = createObserveModule();

@Module({
  imports: [PrismaModule, UserModule, ArticleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
