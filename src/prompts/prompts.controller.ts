import { Controller, Post, Body } from '@nestjs/common';
import { PromptsService } from './prompts.service.ts';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post('translate')
  translate(@Body() body: { text: string; targetLanguage: string }) {
    return this.promptsService.translate(body.text);
  }

  @Post('summarize')
  summarize(@Body() body: { text: string; maxWords: number }) {
    return this.promptsService.summarize(body.text, body.maxWords);
  }

  @Post('classify')
  classify(@Body() body: { text: string }) {
    return this.promptsService.classify(body.text);
  }
}
