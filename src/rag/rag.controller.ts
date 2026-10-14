import { Controller, Post, Get, Delete, Body } from '@nestjs/common';
import { RagService } from './rag.service.ts';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('load')
  loadDocuments(@Body() body: { documents: { id: string; content: string; source?: string }[] }) {
    return this.ragService.loadDocuments(body.documents);
  }

  @Post('search')
  search(@Body() body: { query: string; topK?: number }) {
    return this.ragService.search(body.query, body.topK);
  }

  @Post('query')
  query(@Body() body: { question: string; topK?: number }) {
    return this.ragService.query(body.question, body.topK);
  }

  @Get('status')
  getStatus() {
    return this.ragService.getStatus();
  }

  @Delete('clear')
  clearKnowledge() {
    return this.ragService.clearKnowledge();
  }
}
