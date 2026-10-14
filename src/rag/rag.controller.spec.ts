import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { RagController } from './rag.controller.ts';
import { RagService } from './rag.service.ts';

type RagServiceMock = {
  loadDocuments: Mock;
  search: Mock;
  query: Mock;
  getStatus: Mock;
  clearKnowledge: Mock;
};

describe('RagController', () => {
  let controller: RagController;
  let service: RagServiceMock;

  beforeEach(async () => {
    service = {
      loadDocuments: vi.fn(),
      search: vi.fn(),
      query: vi.fn(),
      getStatus: vi.fn(),
      clearKnowledge: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [{ provide: RagService, useValue: service }],
    }).compile();

    controller = module.get<RagController>(RagController);
  });

  it('load 把 documents 原样交给 service', async () => {
    const documents = [{ id: 'doc-1', content: '内容' }];
    service.loadDocuments.mockResolvedValue({ success: true });

    await expect(controller.loadDocuments({ documents })).resolves.toEqual({ success: true });
    expect(service.loadDocuments).toHaveBeenCalledWith(documents);
  });

  it('search / query 分别透传 query、question 与 topK', async () => {
    await controller.search({ query: '检索词', topK: 5 });
    await controller.query({ question: '问题', topK: 2 });

    expect(service.search).toHaveBeenCalledWith('检索词', 5);
    expect(service.query).toHaveBeenCalledWith('问题', 2);
  });

  it('status / clear 原样返回 service 结果', async () => {
    const status = { loaded: false, docCount: 0 };
    const cleared = { success: true };
    service.getStatus.mockReturnValue(status);
    service.clearKnowledge.mockReturnValue(cleared);

    expect(controller.getStatus()).toBe(status);
    expect(controller.clearKnowledge()).toBe(cleared);
  });
});
