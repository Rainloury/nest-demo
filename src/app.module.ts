import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { UserModule } from './user/user.module.ts';
import { PrismaModule } from './prisma/prisma.module.ts';
import { ModelsModule } from './models/models.module.ts';
import { PromptsModule } from './prompts/prompts.module.ts';
import { PostModule } from './post/post.module.js';
import { ChainsModule } from './chains/chains.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { MemoryModule } from './memory/memory.module.js';
import { RagModule } from './rag/rag.module.js';
import { ToolsModule } from './tools/tools.module.js';

export const { ObserveModule } = createObserveModule();

@Module({
  imports: [
    PrismaModule,
    UserModule,
    ModelsModule,
    PromptsModule,
    PostModule,
    ChainsModule,
    AgentsModule,
    MemoryModule,
    RagModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
