import { Test, TestingModule } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import type { Mock } from 'vitest';
import { AgentsService } from './agents.service.ts';

type FakeLlm = {
  bindTools: Mock;
};

type FakeRunnable = {
  invoke: Mock;
};

/**
 * llm 是私有字段且在实例初始化时创建。测试里替换为假对象，
 * 保证不连接真实 Ollama，同时能覆盖 Agent 的失败分支。
 */
function createService(): { service: AgentsService; llm: FakeLlm; runnable: FakeRunnable } {
  const runnable: FakeRunnable = { invoke: vi.fn() };
  const llm: FakeLlm = { bindTools: vi.fn().mockReturnValue(runnable) };
  const service = new AgentsService();
  (service as unknown as { llm: FakeLlm }).llm = llm;
  return { service, llm, runnable };
}

describe('AgentsService', () => {
  it('应能被创建', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService],
    }).compile();

    const service = module.get<AgentsService>(AgentsService);

    expect(service).toBeDefined();
  });

  it('空消息直接返回失败，不调用模型', async () => {
    const { service, llm } = createService();

    const result = await service.runAgent('   ');

    expect(result.success).toBe(false);
    expect(result.totalRounds).toBe(0);
    expect(llm.bindTools).not.toHaveBeenCalled();
  });

  it('模型直接回答时返回文本结果', async () => {
    const { service, runnable } = createService();
    runnable.invoke.mockResolvedValue(new AIMessage('你好，有什么可以帮你？'));

    const result = await service.runAgent('你好');

    expect(result).toMatchObject({
      success: true,
      totalRounds: 1,
      answer: '你好，有什么可以帮你？',
    });
  });

  it('工具缺少 id 时不执行工具，并返回失败结果', async () => {
    const { service, runnable } = createService();
    runnable.invoke.mockResolvedValue(
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'check_product', args: { productName: 'iPhone 16' } }],
      }),
    );

    const result = await service.runAgent('查一下 iPhone 16');

    expect(result.success).toBe(false);
    expect(result.totalRounds).toBe(1);
    expect(result.steps).toContain('❌ [错误] 工具「check_product」缺少调用 ID，无法执行');
  });

  it('单个工具执行失败时把错误交回模型，而不是打穿整个请求', async () => {
    const { service, runnable } = createService();
    const toolInvoke = vi.fn().mockRejectedValue(new Error('模拟工具故障'));
    (service as unknown as { checkProductTool: { invoke: Mock } }).checkProductTool = { invoke: toolInvoke };
    runnable.invoke
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call-1', name: 'check_product', args: { productName: 'iPhone 16' } }],
        }),
      )
      .mockResolvedValueOnce(new AIMessage('商品查询失败，请稍后再试。'));

    const result = await service.runAgent('查一下 iPhone 16');

    expect(result).toMatchObject({
      success: true,
      totalRounds: 2,
      answer: '商品查询失败，请稍后再试。',
    });
    expect(toolInvoke).toHaveBeenCalledOnce();
    expect(result.steps.some((step) => step.includes('❌ [工具失败] check_product: 模拟工具故障'))).toBe(true);
  });

  it('模型调用失败时返回结构化失败结果，而不是让请求抛异常', async () => {
    const { service, runnable } = createService();
    runnable.invoke.mockRejectedValue(new Error('Ollama 不可用'));

    const result = await service.runAgent('你好');

    expect(result).toMatchObject({
      success: false,
      totalRounds: 1,
      answer: '模型服务暂时不可用，请稍后重试',
    });
    expect(result.steps.some((step) => step.includes('❌ [模型失败] Ollama 不可用'))).toBe(true);
  });
});
