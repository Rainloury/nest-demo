import { Controller, Post, Body } from '@nestjs/common';
import { ToolsService } from './tools.service.ts';

@Controller('tools')
export class ToolsController {
  constructor(private readonly fcService: ToolsService) {}

  @Post('run')
  run(@Body() body: { message: string }) {
    return this.fcService.runFunctionCalling(body.message);
  }
}
