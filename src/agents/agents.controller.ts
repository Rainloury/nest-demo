import { Controller, Post, Body } from '@nestjs/common';
import { AgentsService } from './agents.service.ts';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post('run')
  runAgent(@Body() body: { message: string }) {
    return this.agentsService.runAgent(body.message);
  }
}
