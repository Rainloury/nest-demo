import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller.ts';
import { ModelsService } from './models.service.ts';

@Module({
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
