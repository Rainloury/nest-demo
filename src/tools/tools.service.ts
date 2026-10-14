import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { config } from '../config.ts';

// 单个请求最多让模型「思考 → 调工具」几轮，防止工具调用打转
const MAX_ROUNDS = 3;
// 用户输入会整段进入模型上下文，不封顶时超长文本会放大 token 成本并拖长调用时间
const MAX_MESSAGE_LENGTH = 1000;
const LLM_TIMEOUT_MS = 30_000;
const EMPTY_ANSWER_MESSAGE = '处理完成';

// 商品目录只维护一份：check_inventory 与 create_order 共用，避免两处副本各改一半导致数据漂移
const INVENTORY: Record<string, { stock: number; price: number }> = {
  'iPhone 16': { stock: 50, price: 7999 },
  'MacBook Pro': { stock: 10, price: 15999 },
  'AirPods Pro': { stock: 200, price: 1799 },
};

/** 只取自有属性：productName / 工具名都来自模型输出，直接索引会命中 Object.prototype 上的成员 */
function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** 工具返回值可能是 JSON 字符串、纯文本或任意对象；写日志时统一结构，解析失败就保留原文 */
function toLogPayload(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // 非 JSON 文本原样记录，而不是把整条日志丢掉
  }
}

/** 模型回复的 content 可能是字符串或内容块数组，统一抽出文本部分 */
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
export class ToolsService {
  // temperature 设为 0，保证工具调用参数输出格式稳定
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.baseUrl,
    temperature: 0,
  });

  // ── 业务工具定义 ──────────────────────────────────────

  // 工具一：查询商品库存
  private checkInventoryTool = tool(
    ({ productName }: { productName: string }) => {
      // 模拟数据库查询（实际项目可以注入 PrismaService 查真实数据库）
      const item = lookup(INVENTORY, productName);
      if (!item) return JSON.stringify({ found: false, message: `未找到：${productName}` });
      return JSON.stringify({
        found: true,
        productName,
        stock: item.stock,
        price: item.price,
        status: item.stock > 0 ? '有货' : '缺货',
      });
    },
    {
      name: 'check_inventory',
      description: '查询商品库存和价格',
      schema: z.object({
        productName: z.string().describe('商品名称，例如 iPhone 16'),
      }),
    },
  );

  // 工具二：创建订单
  private createOrderTool = tool(
    ({ productName, quantity, customerName }: { productName: string; quantity: number; customerName: string }) => {
      // 下单前必须复核库存：原实现既不确认商品存在、也不校验数量，会「给不存在的商品下单成功」并超卖
      const item = lookup(INVENTORY, productName);
      if (!item) {
        return JSON.stringify({ success: false, message: `未找到商品：${productName}` });
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return JSON.stringify({ success: false, message: `购买数量必须是正整数，当前为 ${quantity}` });
      }
      if (quantity > item.stock) {
        return JSON.stringify({ success: false, message: `库存不足，${productName} 仅剩 ${item.stock} 件` });
      }

      const orderId = `ORD-${Date.now()}`;
      return JSON.stringify({
        success: true,
        orderId,
        productName,
        quantity,
        customerName,
        unitPrice: item.price,
        totalPrice: item.price * quantity,
        createdAt: new Date().toLocaleString('zh-CN'),
      });
    },
    {
      name: 'create_order',
      description: '为客户创建购买订单，下单前会复核库存是否充足',
      schema: z.object({
        productName: z.string().describe('商品名称'),
        // .int().positive() 让 tool() 的入参校验先拦住 0/负数/小数，而不是等业务层兜底
        quantity: z.number().int().positive().describe('购买数量，必须为正整数'),
        customerName: z.string().describe('客户姓名'),
      }),
    },
  );

  // 工具三：查询订单状态
  private checkOrderTool = tool(
    ({ orderId }: { orderId: string }) => {
      const statuses = ['待支付', '已支付', '备货中', '已发货', '已完成'];
      return JSON.stringify({
        orderId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        updatedAt: new Date().toLocaleString('zh-CN'),
      });
    },
    {
      name: 'check_order',
      description: '查询订单状态',
      schema: z.object({
        // 与 create_order 生成的真实格式保持一致，避免描述误导模型
        orderId: z.string().describe('订单号，create_order 返回的 ORD-<时间戳> 形式'),
      }),
    },
  );

  // ── Function Calling 核心逻辑 ─────────────────────────
  async runFunctionCalling(userMessage: string) {
    // controller 的 body 是外部输入：非字符串直接调 trim() 会抛 TypeError 变成 500，先做类型判断
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      return {
        userMessage,
        toolCalls: [],
        finalAnswer: '请输入需要咨询的问题',
      };
    }

    const trimmedMessage = userMessage.trim();
    // 截断超长输入，防止单次请求把过多 token 塞进上下文
    const question =
      trimmedMessage.length > MAX_MESSAGE_LENGTH ? trimmedMessage.slice(0, MAX_MESSAGE_LENGTH) : trimmedMessage;

    const tools = [this.checkInventoryTool, this.createOrderTool, this.checkOrderTool];
    const toolMap: Record<string, StructuredToolInterface> = {
      check_inventory: this.checkInventoryTool,
      create_order: this.createOrderTool,
      check_order: this.checkOrderTool,
    };

    const llmWithTools = this.llm.bindTools(tools);
    // 消息历史：模型每一轮都能看到完整对话 + 工具结果
    const messages: BaseMessage[] = [new HumanMessage(question)];
    const toolCallLog: Array<Record<string, unknown>> = [];
    let protocolBroken = false;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // 没有超时的模型调用会一直挂着，请求和连接都无法释放
      const response = await llmWithTools.invoke(messages, { timeout: LLM_TIMEOUT_MS });
      messages.push(response);

      if (!response.tool_calls?.length) break;

      for (const toolCall of response.tool_calls) {
        // tool_call_id 是协议必填字段：缺失时无法构造合法的 ToolMessage，只能终止本轮
        if (!toolCall.id) {
          protocolBroken = true;
          break;
        }

        const toolFn = lookup(toolMap, toolCall.name);
        if (!toolFn) {
          // 未知工具也必须回一条 tool 消息，否则 assistant 的 tool_calls 少一条应答，下一轮请求不合法
          messages.push(
            new ToolMessage({ content: `工具「${toolCall.name}」不存在`, tool_call_id: toolCall.id, status: 'error' }),
          );
          continue;
        }

        try {
          // 工具返回值形态由各工具决定，显式收窄为 unknown 再处理，避免 any 继续扩散
          const toolResult: unknown = await toolFn.invoke(toolCall.args);
          const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          toolCallLog.push({
            tool: toolCall.name,
            args: toolCall.args,
            result: toLogPayload(toolResult),
          });
          messages.push(new ToolMessage({ content, tool_call_id: toolCall.id }));
        } catch (error) {
          // 单个工具失败不打断整轮：把错误交回模型，让它决定如何回复
          const errMsg = error instanceof Error ? error.message : String(error);
          messages.push(
            new ToolMessage({ content: `工具执行失败：${errMsg}`, tool_call_id: toolCall.id, status: 'error' }),
          );
        }
      }

      if (protocolBroken) break;
    }

    // 取最后一条「有正文」的 AIMessage：按 constructor.name 判断在打包/压缩后会失效
    const lastAiMessage = [...messages].reverse().find((m) => m instanceof AIMessage && toText(m.content).trim());

    return {
      userMessage,
      toolCalls: toolCallLog, // 调用了哪些工具、参数和结果
      finalAnswer: lastAiMessage ? toText(lastAiMessage.content) : EMPTY_ANSWER_MESSAGE,
    };
  }
}
