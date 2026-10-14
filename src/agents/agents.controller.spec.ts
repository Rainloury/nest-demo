import { Test, TestingModule } from '@nestjs/testing';
import { AgentsController } from './agents.controller.ts';
import { AgentsService } from './agents.service.ts';

describe('AgentsController', () => {
  let controller: AgentsController;
  const runAgent = vi.fn();

  beforeEach(async () => {
    runAgent.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [{ provide: AgentsService, useValue: { runAgent } }],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('应能被创建', () => {
    expect(controller).toBeDefined();
  });

  it('把 message 原样交给 AgentsService', async () => {
    runAgent.mockResolvedValue({ answer: 'ok' });

    await controller.runAgent({ message: '你好' });

    expect(runAgent).toHaveBeenCalledWith('你好');
  });
});
