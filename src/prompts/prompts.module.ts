import { Module } from '@nestjs/common';
import { PromptsController } from './prompts.controller.ts';
import { PromptsService } from './prompts.service.ts';

@Module({
  controllers: [PromptsController],
  providers: [PromptsService],
})
export class PromptsModule {}
