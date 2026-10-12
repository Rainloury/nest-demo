import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { UserModule } from './user/user.module.ts';
import { PrismaModule } from './prisma/prisma.module.ts';
import { ModelsModule } from './models/models.module.ts';
import { PromptsModule } from './prompts/prompts.module.ts';
import { PostModule } from './post/post.module.js';

export const { ObserveModule } = createObserveModule();

@Module({
  imports: [PrismaModule, UserModule, ModelsModule, PromptsModule, PostModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
