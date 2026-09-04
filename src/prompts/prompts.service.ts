import { Injectable } from '@nestjs/common';
import { config } from '../config.js';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate, FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

@Injectable()
export class PromptsService {
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.host,
    temperature: config.ollama.temperature,
    think: false,
    numPredict: 512,
  });

  // 多消息对话模板
  async translate(text: string, targetLanguage: string = 'en') {
    const prompt = ChatPromptTemplate.fromMessages([
      { role: 'system', content: `You are a helpful assistant that translates ${targetLanguage} to English.` },
      { role: 'user', content: `Translate the following text to ${targetLanguage}: ${text}` },
    ]);
    const chian = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const response = await chian.invoke({ text, targetLanguage });
    return { original: text, translated: response };
  }

  // 总结提示词模板
  async summarize(text: string, maxWords: number) {
    const prompt = ChatPromptTemplate.fromTemplate('请把以下内容总结成不超过{maxWords}个字的版本：{text}');
    const chian = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const response = await chian.invoke({ text, maxWords });
    return { original: text, maxWords, summary: response };
  }

  // 分类提示词模板  fewShot训练
  async classify(text: string) {
    // 数组的例子，训练大模型做判断
    const examples = [
      { text: '今天天气真好，我们去公园玩吧', label: '积极' },
      { text: '我讨厌这个产品', label: '消极' },
      { text: '这个电影还行，有些地方不错', label: '中立' },
    ];
    const examplePrompt = PromptTemplate.fromTemplate('文本: {text}\n情感: {label}');
    const fewShotPrompt = new FewShotPromptTemplate({
      examples,
      examplePrompt,
      prefix: '请根据以下示例对文本进行情感分类',
      suffix: '文本: {text}\n情感:',
      inputVariables: ['text'],
    });
    const formattedPrompt = await fewShotPrompt.format({ text });
    const res = await this.llm.invoke([{ role: 'user', content: formattedPrompt }]);
    return { original: text, classification: res.content };
  }
}
