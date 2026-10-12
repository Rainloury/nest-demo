import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { PromptsController } from './prompts.controller.ts';
import { PromptsService } from './prompts.service.ts';

type PromptsServiceMock = { translate: Mock; summarize: Mock; classify: Mock };

describe('PromptsController', () => {
  let controller: PromptsController;
  let service: PromptsServiceMock;

  beforeEach(async () => {
    service = { translate: vi.fn(), summarize: vi.fn(), classify: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsController],
      providers: [{ provide: PromptsService, useValue: service }],
    }).compile();

    controller = module.get<PromptsController>(PromptsController);
  });

  it('translate 透传 text 与 targetLanguage', async () => {
    const response = { original: '你好', translated: 'Hello' };
    service.translate.mockResolvedValue(response);

    await expect(controller.translate({ text: '你好', targetLanguage: 'en' })).resolves.toBe(response);
    expect(service.translate).toHaveBeenCalledWith('你好', 'en');
  });

  it('summarize 透传 text 与 maxWords', async () => {
    const response = { original: 'long text', maxWords: 10, summary: 'ok' };
    service.summarize.mockResolvedValue(response);

    await expect(controller.summarize({ text: 'long text', maxWords: 10 })).resolves.toBe(response);
    expect(service.summarize).toHaveBeenCalledWith('long text', 10);
  });

  it('classify 透传 text', async () => {
    const response = { original: '不错', classification: '积极' };
    service.classify.mockResolvedValue(response);

    await expect(controller.classify({ text: '不错' })).resolves.toBe(response);
    expect(service.classify).toHaveBeenCalledWith('不错');
  });
});
