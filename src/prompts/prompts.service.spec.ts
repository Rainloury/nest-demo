import { RunnableLambda } from '@langchain/core/runnables';
import { PromptsService } from './prompts.service.ts';

/**
 * llm 是私有字段、且在字段初始化时就 new 了 ChatOllama。
 * translate / summarize 的链路是 prompt.pipe(llm).pipe(parser)，
 * LangChain 的 pipe 要求每一环都是真正的 Runnable，否则会直接抛错 ——
 * 所以这里用 RunnableLambda（真 Runnable、但不发起任何网络请求）替换 llm，
 * 并用 captured 记录实际送进模型的内容。
 */
function createService(respond: () => unknown) {
  const captured: unknown[] = [];
  const llm = RunnableLambda.from(async (input: unknown) => {
    captured.push(input);
    return respond();
  });

  const service = new PromptsService();
  (service as unknown as { llm: unknown }).llm = llm;
  return { service, captured };
}

describe('PromptsService', () => {
  it('translate 把原文与目标语言装进提示词，并回传原文与译文', async () => {
    const { service, captured } = createService(() => 'Hello world');

    const result = await service.translate('你好世界', 'en');

    expect(result).toEqual({ original: '你好世界', translated: 'Hello world' });
    expect(String(captured[0])).toContain('你好世界');
    expect(String(captured[0])).toContain('to en');
  });

  it('translate 不传目标语言时回落到默认值 en', async () => {
    const { service, captured } = createService(() => 'Good morning');

    const result = await service.translate('早上好');

    expect(result).toEqual({ original: '早上好', translated: 'Good morning' });
    expect(String(captured[0])).toContain('to en');
  });

  it('summarize 把 maxWords 与原文一起放进提示词，并回传摘要', async () => {
    const { service, captured } = createService(() => '简短摘要');

    const result = await service.summarize('很长的一段文字', 20);

    expect(result).toEqual({ original: '很长的一段文字', maxWords: 20, summary: '简短摘要' });
    expect(String(captured[0])).toContain('20');
    expect(String(captured[0])).toContain('很长的一段文字');
  });

  it('classify 用 few-shot 示例组装提示词，并回传模型给出的分类', async () => {
    const { service, captured } = createService(() => ({ content: '积极' }));

    const result = await service.classify('今天心情不错');

    expect(result).toEqual({ original: '今天心情不错', classification: '积极' });

    // classify 走的是 llm.invoke([{ role, content }])，输入是数组，要取其中一条消息的 content
    const [message] = captured[0] as [{ content: string }];
    const sent = message.content;
    expect(sent).toContain('请根据以下示例对文本进行情感分类');
    expect(sent).toContain('消极');
    expect(sent).toContain('今天心情不错');
  });
});
