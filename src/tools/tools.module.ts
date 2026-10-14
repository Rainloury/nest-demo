import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service.js';

@Module({
  providers: [ToolsService],
})
export class ToolsModule {}
