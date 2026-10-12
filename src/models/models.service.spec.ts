import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Response } from 'express';
import type { Mock } from 'vitest';
import { ModelsService } from './models.service.ts';

type FakeLlm = { invoke: Mock; stream: Mock; pipe: Mock };

/**
 * llm 是私有字段、且在字段初始化时就 new 了 ChatOllama。
 * 单测里把它整体换成假对象，既不连 Ollama，也不用改动源码（AGENTS.md 7）。
 */
function createService(): { service: ModelsService; llm: FakeLlm } {
  const llm: FakeLlm = { invoke: vi.fn(), stream: vi.fn(), pipe: vi.fn() };
  const service = new ModelsService();
  (service as unknown as { llm: FakeLlm }).llm = llm;
  return { service, llm };
}

describe('ModelsService', () => {
  it('baseChat 用一条人类消息调用模型，并回传问题、答案与用量', async () => {
    const { service, llm } = createService();
    llm.invoke.mockResolvedValue({ content: '你好，我是模型', usage_metadata: { total_tokens: 12 } });

    const result = await service.baseChat('你好');

    const messages = llm.invoke.mock.calls[0]?.[0] as unknown[];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(result).toEqual({ question: '你好', answer: '你好，我是模型', usage: { total_tokens: 12 } });
  });

  it('chatSystem 按 system + human 两条消息调用模型', async () => {
    const { service, llm } = createService();
    llm.invoke.mockResolvedValue({ content: 'ok', usage_metadata: { total_tokens: 3 } });

    const result = await service.chatSystem({ system: '你是翻译官', message: 'hello' });

    const messages = llm.invoke.mock.calls[0]?.[0] as unknown[];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(result).toEqual({
      system: '你是翻译官',
      question: 'hello',
      answer: 'ok',
      usage: { total_tokens: 3 },
    });
  });

  it('chatStream 先写 SSE 响应头，再逐块 write，最后以 [DONE] 收尾', async () => {
    const { service, llm } = createService();
    llm.stream.mockResolvedValue(
      (async function* () {
        yield { content: 'foo' };
        yield { content: 'bar' };
      })(),
    );

    const setHeader = vi.fn();
    const write = vi.fn();
    const end = vi.fn();
    const res = { setHeader, write, end } as unknown as Response;

    await service.chatStream({ system: 's', message: 'm' }, res);

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(write).toHaveBeenNthCalledWith(1, 'data: {"content":"foo"}\n\n');
    expect(write).toHaveBeenNthCalledWith(2, 'data: {"content":"bar"}\n\n');
    expect(write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('pipelineChat 走 llm.pipe(parser) 链路，并返回解析后的字符串', async () => {
    const { service, llm } = createService();
    const invoke = vi.fn().mockResolvedValue('解析后的答案');
    llm.pipe.mockReturnValue({ invoke });

    const result = await service.pipelineChat({ message: '总结一下' });

    expect(llm.pipe).toHaveBeenCalledTimes(1);
    const messages = invoke.mock.calls[0]?.[0] as unknown[];
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(result).toEqual({ question: '总结一下', answer: '解析后的答案' });
  });
});
