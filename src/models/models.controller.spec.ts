import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import type { Mock } from 'vitest';
import { ModelsController } from './models.controller.ts';
import { ModelsService } from './models.service.ts';

type ModelsServiceMock = {
  baseChat: Mock;
  chatSystem: Mock;
  chatStream: Mock;
  pipelineChat: Mock;
};

describe('ModelsController', () => {
  let controller: ModelsController;
  let service: ModelsServiceMock;

  beforeEach(async () => {
    service = {
      baseChat: vi.fn(),
      chatSystem: vi.fn(),
      chatStream: vi.fn(),
      pipelineChat: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelsController],
      providers: [{ provide: ModelsService, useValue: service }],
    }).compile();

    controller = module.get<ModelsController>(ModelsController);
  });

  it('chat 把 message 交给 baseChat，并用 { response } 包一层', async () => {
    service.baseChat.mockResolvedValue({ answer: 'hi' });

    await expect(controller.baseChat({ message: 'hi' })).resolves.toEqual({ response: { answer: 'hi' } });
    expect(service.baseChat).toHaveBeenCalledWith('hi');
  });

  it('chat-system 透传 system 与 message', async () => {
    service.chatSystem.mockResolvedValue({ answer: 'ok' });

    await expect(controller.chatSystem({ system: 's', message: 'm' })).resolves.toEqual({
      response: { answer: 'ok' },
    });
    expect(service.chatSystem).toHaveBeenCalledWith({ system: 's', message: 'm' });
  });

  it('chat-stream 把 express 响应对象透传给 service，并把 res 一并返回', async () => {
    service.chatStream.mockResolvedValue(undefined);
    const res = { write: vi.fn(), end: vi.fn() } as unknown as Response;

    await expect(controller.chatStream({ system: 's', message: 'm' }, res)).resolves.toEqual({
      response: undefined,
      res,
    });
    expect(service.chatStream).toHaveBeenCalledWith({ system: 's', message: 'm' }, res);
  });

  it('chat-parser 走 pipelineChat', async () => {
    service.pipelineChat.mockResolvedValue({ answer: 'parsed' });

    await expect(controller.chatParser({ message: 'x' })).resolves.toEqual({
      response: { answer: 'parsed' },
    });
    expect(service.pipelineChat).toHaveBeenCalledWith({ message: 'x' });
  });
});
