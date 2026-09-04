import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { config } from '../config.js';
import type { Response } from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';

@Injectable()
export class ModelsService {
  // 创建ollama实例
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.host,
    temperature: config.ollama.temperature,
    think: false,
    numPredict: 512,
  });

  // invoke 普通问答方式，没有流式输出
  async baseChat(message: string) {
    const response = await this.llm.invoke([new HumanMessage(message)]);
    return {
      question: message,
      answer: response.content,
      usage: response.usage_metadata,
    };
  }

  // invoke 系统消息方式，没有流式输出
  async chatSystem({ system, message }: { system: string; message: string }) {
    const response = await this.llm.invoke([new SystemMessage(system), new HumanMessage(message)]);
    return {
      system,
      question: message,
      answer: response.content,
      usage: response.usage_metadata,
    };
  }

  // invoke 流式输出方式
  async chatStream({ system, message }: { system: string; message: string }, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const stream = await this.llm.stream([new SystemMessage(system), new HumanMessage(message)]);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  // pipeline 组合多个模型一起使用提示词，先用一个模型生成提示词，再用另一个模型生成最终答案
  async pipelineChat({ message }: { message: string }) {
    const parser = new StringOutputParser();
    const chain = this.llm.pipe(parser);
    const answer = await chain.invoke([new HumanMessage(message)]);
    // answer is a string, you can return it directly or wrap it in an object
    return {
      question: message,
      answer,
    };
  }
}
