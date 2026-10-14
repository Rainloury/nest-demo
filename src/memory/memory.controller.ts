import { Controller, Post, Get, Delete, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MemoryService } from './memory.service.ts';

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('chat')
  chat(@Body() body: { sessionId: string; message: string }) {
    return this.memoryService.chat(body.sessionId, body.message);
  }

  @Post('chat-stream')
  chatStream(@Body() body: { sessionId: string; message: string }, @Res() res: Response) {
    return this.memoryService.chatStream(body.sessionId, body.message, res);
  }

  @Get('history/:sessionId')
  getHistory(@Param('sessionId') sessionId: string) {
    return this.memoryService.getHistory(sessionId);
  }

  @Delete('session/:sessionId')
  clearSession(@Param('sessionId') sessionId: string) {
    return this.memoryService.clearSession(sessionId);
  }

  @Get('sessions')
  listSessions() {
    return this.memoryService.listSessions();
  }
}
