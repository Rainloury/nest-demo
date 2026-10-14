import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { config } from '../config.ts';

@Injectable()
export class ChainsService {
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.baseUrl,
    temperature: config.ollama.temperature,
  });
  private parser = new StringOutputParser();

  // ── 多步骤链：文章润色（分析问题 → 润色文章）──────────
  // RunnableSequence：把多个步骤组合成顺序链
  // RunnablePassthrough：透传输入值（用于在分叉步骤保留原始输入）
  async polishArticle(article: string) {
    const analyzePrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，只输出问题列表，不要其他内容。'],
      ['human', '分析这篇文章存在的问题：\n\n{article}'],
    ]);

    const polishPrompt = ChatPromptTemplate.fromMessages([
      ['system', '你是专业编辑，根据问题列表润色原文，保持原意。'],
      ['human', '原文：\n{article}\n\n问题：\n{issues}\n\n请输出润色后的文章：'],
    ]);

    // 第一条链：article字符串 → 分析 → issues字符串
    const analyzeChain = analyzePrompt.pipe(this.llm).pipe(this.parser);

    // RunnableSequence：分两步执行
    // 步骤1：同时保留 article 原文 + 调用 analyzeChain 得到 issues
    // 步骤2：把 { article, issues } 传给 polishChain 润色
    const fullChain = RunnableSequence.from([
      {
        article: new RunnablePassthrough(), // 原文直接透传
        issues: analyzeChain, // 分析链得到问题列表
      },
      polishPrompt.pipe(this.llm).pipe(this.parser),
    ]);

    const result = await fullChain.invoke(article);
    return { original: article, polished: result };
  }

  // ── 顺序链：博客生成（关键词→大纲→文章→SEO标题）──────
  async generateBlog(keywords: string, style: string) {
    // 三条独立链，顺序执行，上一步输出传给下一步
    const outlineChain = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，只输出大纲，不要正文。'],
      ['human', '根据关键词"{keywords}"，写一篇{style}风格的博客大纲（3-5个章节）'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const articleChain = ChatPromptTemplate.fromMessages([
      ['system', '你是专业博客作者，按照大纲写完整文章。'],
      ['human', '大纲：\n{outline}\n\n请写出完整的博客文章：'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const titleChain = ChatPromptTemplate.fromMessages([
      ['system', '你是SEO专家，只输出5个候选标题。'],
      ['human', '根据以下文章生成5个吸引点击的标题：\n\n{article}'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const outline = await outlineChain.invoke({ keywords, style });
    const article = await articleChain.invoke({ outline });
    const titles = await titleChain.invoke({ article });

    return { keywords, style, outline, article, seoTitles: titles };
  }

  // ── 条件分支链：客服路由（分类 → 路由到不同处理链）────
  async smartRouter(question: string) {
    // 第一步：分类
    const classifyChain = ChatPromptTemplate.fromMessages([
      [
        'system',
        `分析用户问题，只输出分类标签：
技术问题 → TECH
退款问题 → REFUND
投诉建议 → COMPLAINT
其他 → OTHER`,
      ],
      ['human', '{question}'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const category = (await classifyChain.invoke({ question })).trim();

    // 第二步：根据分类选择对应 System Prompt
    const systemMap: Record<string, string> = {
      TECH: '你是技术支持专家，给出具体操作步骤。',
      REFUND: '你是退款专员，引导完成退款流程，态度友好。',
      COMPLAINT: '你是客户关系专员，认真对待投诉，给出解决方案。',
      OTHER: '你是通用客服，友好回答各类问题。',
    };

    const systemPrompt = systemMap[category] || systemMap.OTHER;

    const answerChain = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', '{question}'],
    ])
      .pipe(this.llm)
      .pipe(this.parser);

    const answer = await answerChain.invoke({ question });
    return { question, category, answer };
  }
}
