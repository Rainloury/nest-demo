import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service.js';
import { MemoryController } from './memory.controller.js';

@Module({
  providers: [MemoryService],
  controllers: [MemoryController]
})
export class MemoryModule {}
