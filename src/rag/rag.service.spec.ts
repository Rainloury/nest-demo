import { BadRequestException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import type { Mock } from 'vitest';
import { RagService } from './rag.service.ts';

type FakeVectorStore = {
  similaritySearchWithScore: Mock;
};

type RagError = BadRequestException | ServiceUnavailableException | UnprocessableEntityException;

async function captureError(run: () => Promise<unknown>): Promise<RagError> {
  const error = await run().then(
    () => null,
    (value: unknown) => value,
  );
  expect(error).toBeInstanceOf(Error);
  return error as RagError;
}

function setVectorStore(service: RagService, vectorStore: FakeVectorStore | null): void {
  (service as unknown as { vectorStore: FakeVectorStore | null }).vectorStore = vectorStore;
}

describe('RagService', () => {
  let service: RagService;

  beforeEach(() => {
    service = new RagService();
  });

  it('未加载文档时 search 返回 422，而不是让检索穿透', async () => {
    const error = await captureError(() => service.search('问题'));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
  });

  it.each([
    ['空 query', () => service.search('   '), 'query'],
    ['空 question', () => service.query(''), 'question'],
  ])('%s 在检索前拦成 400', async (_name, run, field) => {
    const error = await captureError(run);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      success: false,
      message: `${field} 必须是非空字符串`,
    });
  });

  it.each([
    ['documents 不是数组', {}],
    ['documents 为空数组', []],
    ['文档缺少 id', [{ content: '内容' }]],
    ['文档 content 为空白', [{ id: 'doc-1', content: '  ' }]],
  ])('%s 时 loadDocuments 拦成 400', async (_name, documents) => {
    const error = await captureError(() => service.loadDocuments(documents as never));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });

  it('topK 非法时回落到默认值 3，超出上限时钳制为 10', async () => {
    const search = vi.fn().mockResolvedValue([]);
    setVectorStore(service, { similaritySearchWithScore: search });

    await service.search('问题', Number('abc'));
    expect(search).toHaveBeenLastCalledWith('问题', 3);

    await service.search('问题', 999);
    expect(search).toHaveBeenLastCalledWith('问题', 10);
  });

  it('向量化失败时抛出 503，并保留原知识库状态', async () => {
    const embeddings = (service as unknown as { embeddings: { embedDocuments: Mock } }).embeddings;
    const originalEmbedDocuments = embeddings.embedDocuments;
    embeddings.embedDocuments = vi.fn().mockRejectedValue(new Error('Ollama 不可用'));

    try {
      const error = await captureError(() => service.loadDocuments([{ id: 'doc-1', content: '用于触发向量化的内容' }]));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      expect(service.getStatus()).toMatchObject({ loaded: false, docCount: 0 });
    } finally {
      embeddings.embedDocuments = originalEmbedDocuments;
    }
  });

  it('命中检索结果时返回统一结构，并修正缺失的 source 和非法 score', async () => {
    const search = vi.fn().mockResolvedValue([[new Document({ pageContent: '片段内容', metadata: {} }), Number.NaN]]);
    setVectorStore(service, { similaritySearchWithScore: search });

    const result = await service.search('  问题  ');

    expect(search).toHaveBeenCalledWith('问题', 3);
    expect(result).toMatchObject({
      success: true,
      data: {
        query: '问题',
        results: [{ content: '片段内容', source: 'unknown', score: 0 }],
      },
    });
    expect(typeof result.timestamp).toBe('string');
  });
});
