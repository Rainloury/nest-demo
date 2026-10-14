import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { config } from '../config.ts';

// 单个会话最多保留的对话轮次（SystemMessage 另算）：
// 历史是整段发给模型的，不裁剪会让 token 成本随轮次线性增长，最终超出模型上下文窗口
const MAX_HISTORY_TURNS = 10;
// 会话上限与空闲过期时间：sessionId 由客户端提供，不设上限时随便造 id 就能撑爆内存
const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 2000;
const LLM_TIMEOUT_MS = 30_000;

type Session = {
  messages: BaseMessage[];
  turns: number; // 累计完成的轮次，不受滑动窗口裁剪影响
  lastActive: number; // 最近活跃时间，用于空闲淘汰
};

/** llm 的 content 可能是字符串，也可能是内容块数组，统一抽出文本部分 */
function toText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      const text = (part as { text?: unknown } | null)?.text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.baseUrl,
    temperature: config.ollama.temperature,
  });

  // 会话存储：sessionId → 会话状态
  // NestJS Service 是单例，Map 在整个应用生命周期内存在
  private sessions = new Map<string, Session>();

  // 每个会话一条串行队列：并发请求会交错读写 messages，导致历史顺序错乱、模型拿到错位上下文
  private queues = new Map<string, Promise<unknown>>();

  private systemMessage = new SystemMessage('你是一个智能助手，能记住对话历史，根据上下文准确回答。');

  // ── 内部工具 ──────────────────────────────────────────
  /** 校验并清洗外部传入的文本：非字符串/空串会让 undefined 退化成同一个 Map key，必须先拦住 */
  private requireText(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException({
        success: false,
        message: `${field} 不能为空`,
        timestamp: new Date().toISOString(),
      });
    }
    const text = value.trim();
    // 超长文本只截断不报错：既守住上下文成本，也不打断正常对话
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  /** 会话数量治理：先按空闲时间清理，再按 LRU 兜底，保证 Map 不会无限增长 */
  private pruneSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > SESSION_TTL_MS) this.sessions.delete(id);
    }
    if (this.sessions.size <= MAX_SESSIONS) return;

    // 最久未活跃的排在前面，优先淘汰；处理中的会话不能动，否则会丢掉请求途中的上下文
    const byOldest = [...this.sessions.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive);
    for (const [id] of byOldest) {
      if (this.sessions.size <= MAX_SESSIONS) break;
      if (this.queues.has(id)) continue;
      this.sessions.delete(id);
    }
  }

  private getOrCreate(sessionId: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.pruneSessions();
      // 新会话：初始化时加入 SystemMessage
      session = { messages: [this.systemMessage], turns: 0, lastActive: Date.now() };
      this.sessions.set(sessionId, session);
    }
    session.lastActive = Date.now();
    return session;
  }

  /** 滑动窗口裁剪：始终保留 SystemMessage + 最近 MAX_HISTORY_TURNS 轮对话 */
  private trimHistory(session: Session): void {
    const maxMessages = 1 + MAX_HISTORY_TURNS * 2;
    if (session.messages.length <= maxMessages) return;
    session.messages.splice(
      0,
      session.messages.length,
      session.messages[0],
      ...session.messages.slice(-MAX_HISTORY_TURNS * 2),
    );
  }

  /** 同一 sessionId 上的操作串行执行，避免并发写坏共享的会话历史 */
  private runExclusive<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    // 前一个任务无论成功失败都要继续排队，所以 onRejected 也传 task
    const current = previous.then(task, task);
    const tail: Promise<unknown> = current.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(sessionId, tail);
    void tail.then(() => {
      // 队列排空后清掉条目，避免 queues 自身无限增长
      if (this.queues.get(sessionId) === tail) this.queues.delete(sessionId);
    });
    return current;
  }

  // ── 多轮对话（REST 版本）──────────────────────────────
  async chat(sessionId: string, message: string) {
    const id = this.requireText(sessionId, 'sessionId', MAX_SESSION_ID_LENGTH);
    const text = this.requireText(message, 'message', MAX_MESSAGE_LENGTH);

    return this.runExclusive(id, async () => {
      const session = this.getOrCreate(id);
      const userMessage = new HumanMessage(text);

      // 把用户新消息加入历史
      session.messages.push(userMessage);

      let response: BaseMessage;
      try {
        // 把完整历史发给模型（包含 System + 所有历史 + 本次消息）
        // 模型看到完整上下文，能理解之前说了什么
        response = await this.llm.invoke(session.messages, { timeout: LLM_TIMEOUT_MS });
      } catch (error) {
        // 调用失败时精确回滚本条用户消息，否则历史里会留下一条没人回应的提问，污染后续上下文
        const index = session.messages.indexOf(userMessage);
        if (index !== -1) session.messages.splice(index, 1);
        throw error;
      }

      // 把模型回复也加入历史，下次对话继续携带
      session.messages.push(response);
      session.turns++;
      this.trimHistory(session);

      return {
        sessionId: id,
        message: text,
        reply: toText(response.content),
        turns: session.turns, // 对话轮次
      };
    });
  }

  // ── 多轮对话（SSE 流式版本）──────────────────────────
  async chatStream(sessionId: string, message: string, res: Response) {
    const id = this.requireText(sessionId, 'sessionId', MAX_SESSION_ID_LENGTH);
    const text = this.requireText(message, 'message', MAX_MESSAGE_LENGTH);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 客户端断开后主动中止上游流式请求，否则模型会继续推理并一直占用连接资源
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    // 写入前判断连接状态：对已关闭的 socket 写入会抛错，把整个响应流程带崩
    const writeSse = (payload: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    await this.runExclusive(id, async () => {
      const session = this.getOrCreate(id);
      const userMessage = new HumanMessage(text);
      session.messages.push(userMessage);

      let fullReply = '';
      let failed = false;

      try {
        const stream = await this.llm.stream(session.messages, { timeout: LLM_TIMEOUT_MS, signal: abort.signal });
        for await (const chunk of stream) {
          const piece = toText(chunk.content);
          if (!piece) continue;
          fullReply += piece;
          writeSse({ text: piece, sessionId: id });
        }
      } catch (error) {
        failed = true;
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`流式对话失败（session=${id}）：${errMsg}`);
        writeSse({ error: '生成回复失败，请稍后重试', sessionId: id });
      }

      if (fullReply) {
        // 已生成内容（哪怕是半截）也入库，保证 user/assistant 成对、上下文可续
        session.messages.push(new AIMessage(fullReply));
        session.turns++;
        this.trimHistory(session);
      } else if (failed) {
        // 一个字都没生成：精确回滚本条用户消息，不在历史里留下悬空的提问
        const index = session.messages.indexOf(userMessage);
        if (index !== -1) session.messages.splice(index, 1);
      }

      writeSse({ text: '[DONE]', turns: session.turns });
      if (!res.writableEnded && !res.destroyed) res.end();
    });
  }

  // ── 查看会话历史 ──────────────────────────────────────
  getHistory(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { sessionId, exists: false, messages: [] };

    const messages = session.messages
      .filter((m) => !(m instanceof SystemMessage))
      .map((m, i) => ({
        index: i + 1,
        role: m instanceof HumanMessage ? 'user' : 'assistant',
        content: m.content,
      }));

    return {
      sessionId,
      exists: true,
      // 用累计计数器而不是窗口长度，避免历史裁剪后轮次“变小”
      turns: session.turns,
      messages,
    };
  }

  // ── 清空会话 ──────────────────────────────────────────
  clearSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { sessionId, cleared: false, message: '会话不存在' };
    }
    session.messages = [this.systemMessage];
    session.turns = 0;
    session.lastActive = Date.now();
    return { sessionId, cleared: true, message: '会话已清空' };
  }

  // ── 所有会话列表 ──────────────────────────────────────
  listSessions() {
    const sessions = Array.from(this.sessions.entries()).map(([id, session]) => ({
      sessionId: id,
      turns: session.turns,
    }));
    return { total: sessions.length, sessions };
  }
}
