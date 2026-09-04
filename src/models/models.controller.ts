import { Controller, Post, Body, Res } from '@nestjs/common';
import { ModelsService } from './models.service.js';
import type { Response } from 'express';

@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  // invoke 普通问答方式，没有流式输出
  @Post('chat')
  baseChat(@Body() body: { message: string }) {
    const response = this.modelsService.baseChat(body.message);
    return { response };
  }

  // invoke 系统消息方式，没有流式输出
  @Post('chat-system')
  async chatSystem(@Body() body: { system: string; message: string }) {
    const response = await this.modelsService.chatSystem({ system: body.system, message: body.message });
    return { response };
  }

  // invoke 流式输出方式
  @Post('chat-stream')
  async chatStream(@Body() body: { system: string; message: string }, @Res() res: Response) {
    const response = await this.modelsService.chatStream({ system: body.system, message: body.message }, res);
    return { response, res };
  }

  @Post('chat-parser')
  async chatParser(@Body() body: { message: string }) {
    const response = await this.modelsService.pipelineChat({ message: body.message });
    return { response };
  }
}
