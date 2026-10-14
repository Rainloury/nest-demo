import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { HumanMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { config } from '../config.ts';

const MAX_ROUNDS = 6;
const LLM_TIMEOUT_MS = 30_000;
const EMPTY_ANSWER_MESSAGE = '抱歉，暂时无法处理您的请求';
// 用户输入会整段进入模型上下文，不设上限时超长文本会放大 token 成本并拖长调用时间
const MAX_MESSAGE_LENGTH = 1000;

// 商品目录只维护一份：check_product / create_order 共用，避免两处副本各改一半造成数据漂移
const PRODUCTS: Record<string, { price: number; stock: number; category: string }> = {
  'iPhone 16': { price: 7999, stock: 50, category: '手机' },
  'iPhone 16 Pro': { price: 9999, stock: 20, category: '手机' },
  'MacBook Pro': { price: 15999, stock: 8, category: '电脑' },
  'AirPods Pro': { price: 1799, stock: 200, category: '耳机' },
  'iPad Air': { price: 4799, stock: 30, category: '平板' },
};

// 只取 Date.now() 末 6 位时，同毫秒并发会撞号；叠加自增序号保证单进程内唯一
let bizIdSeq = 0;
function genBizId(prefix: string): string {
  bizIdSeq = (bizIdSeq + 1) % 1000;
  const suffix = ((Date.now() + bizIdSeq) % 1_000_000).toString().padStart(6, '0');
  return `${prefix}-${suffix}`;
}

type AgentTool = StructuredToolInterface;

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.baseUrl,
    // 温度统一走 config（OLLAMA_TEMPERATURE）：写死 0.1 会让环境变量静默失效
    temperature: config.ollama.temperature,
    think: false,
    numPredict: 1024,
  });

  // ══════════════════════════════════════════════════════
  // 工具定义
  // tool() 把普通 JS 函数包装成模型能识别的格式
  //   name：工具名（模型据此决定何时调用）
  //   description：工具描述（模型据此理解这个工具能干什么）
  //   schema：参数定义（zod 格式，告诉模型调用时传什么参数）
  // ══════════════════════════════════════════════════════

  // ── 工具一：查询商品库存和价格 ──────────────────────────
  private checkProductTool = tool(
    ({ productName }: { productName: string }) => {
      this.logger.debug(`工具执行 check_product：${productName}`);

      // 模拟商品数据库（实际项目注入 PrismaService 查真实数据库）
      const product = Object.hasOwn(PRODUCTS, productName) ? PRODUCTS[productName] : undefined;

      if (!product) {
        return `商品「${productName}」不存在，请检查商品名称是否正确。`;
      }
      if (product.stock === 0) {
        return `商品「${productName}」当前缺货，预计下周补货。`;
      }

      return `商品「${productName}」有货，单价 ¥${product.price}，库存 ${product.stock} 件，分类：${product.category}。`;
    },
    {
      name: 'check_product',
      // description 非常关键：模型根据这段描述决定何时调用这个工具
      description: '查询商品是否有货、商品价格和库存数量。用户问"有没有XX"、"XX多少钱"、"XX有货吗"时调用。',
      schema: z.object({
        productName: z.string().describe('商品名称，例如 iPhone 16、MacBook Pro'),
      }),
    },
  );

  // ── 工具二：创建订单 ────────────────────────────────────
  private createOrderTool = tool(
    ({ productName, quantity, customerName }: { productName: string; quantity: number; customerName: string }) => {
      this.logger.debug(`工具执行 create_order：${customerName} 购买 ${productName} x${quantity}`);

      const product = Object.hasOwn(PRODUCTS, productName) ? PRODUCTS[productName] : undefined;
      if (!product) {
        return `下单失败：商品「${productName}」不存在，请先确认商品名称。`;
      }
      // 数量校验提前到库存判断之前：数量非法时先拦住，避免用无效数量参与库存比较
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return `下单失败：购买数量必须是正整数，当前为 ${quantity}。`;
      }
      if (product.stock === 0) {
        return `下单失败：商品「${productName}」当前缺货。`;
      }
      // 关键边界：不能卖出超过库存的数量（原实现只要 stock>0 就放行，会超卖）
      if (quantity > product.stock) {
        return `下单失败：商品「${productName}」库存不足，当前仅剩 ${product.stock} 件，无法购买 ${quantity} 件。`;
      }

      const unitPrice = product.price;
      const totalPrice = unitPrice * quantity;
      // 生成简短订单号，便于演示
      const orderId = genBizId('ORD');

      return `订单创建成功！订单号：${orderId}，客户：${customerName}，商品：${productName} x${quantity}，单价 ¥${unitPrice}，总价 ¥${totalPrice}。请在 30 分钟内完成支付。`;
    },
    {
      name: 'create_order',
      description:
        '为客户创建购买订单。需要知道商品名称、购买数量、客户姓名才能下单。用户说"我要买XX"、"帮我下单"时调用。',
      schema: z.object({
        productName: z.string().describe('商品名称'),
        quantity: z.number().int().positive().describe('购买数量，必须为正整数'),
        customerName: z.string().describe('客户姓名'),
      }),
    },
  );

  // ── 工具三：查询订单状态 ────────────────────────────────
  private checkOrderTool = tool(
    ({ orderId }: { orderId: string }) => {
      this.logger.debug(`工具执行 check_order：${orderId}`);

      // 模拟订单状态（实际项目查数据库）
      const statuses = ['待支付', '已支付待发货', '已发货运输中', '已签收'];
      const status = statuses[Math.floor(Math.random() * statuses.length)] ?? statuses[0];
      const extra = status === '已发货运输中' ? '，预计明天送达' : '';

      return `订单 ${orderId} 当前状态：${status}${extra}。`;
    },
    {
      name: 'check_order',
      description: '查询订单的当前状态。用户说"我的订单"、"订单到哪了"、"查一下订单 ORD-XXX"时调用。',
      schema: z.object({
        orderId: z.string().describe('订单号，格式为 ORD-XXXXXX'),
      }),
    },
  );

  // ── 工具四：申请退款 ────────────────────────────────────
  private applyRefundTool = tool(
    ({ orderId, reason }: { orderId: string; reason: string }) => {
      this.logger.debug(`工具执行 apply_refund：订单 ${orderId}，原因：${reason}`);

      const refundId = genBizId('REF');
      return `退款申请已提交！退款单号：${refundId}，订单：${orderId}，退款原因：${reason}。预计 1-3 个工作日内退回原支付渠道，请注意查收。`;
    },
    {
      name: 'apply_refund',
      description: '为客户申请订单退款。用户说"我要退款"、"申请退货"、"不想要了"时调用。需要订单号和退款原因。',
      schema: z.object({
        orderId: z.string().describe('需要退款的订单号'),
        reason: z.string().describe('退款原因，例如：质量问题、不喜欢、买错了'),
      }),
    },
  );

  // ══════════════════════════════════════════════════════
  // Agent 核心执行逻辑
  // ══════════════════════════════════════════════════════
  async runAgent(userMessage: string) {
    // controller 的 body 是外部输入：非字符串时直接调 trim() 会抛 TypeError 变成 500，先做类型判断
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      return {
        success: false,
        userMessage,
        steps: ['❌ [错误] 用户消息不能为空'],
        totalRounds: 0,
        answer: '请输入需要咨询的问题',
      };
    }

    const trimmedMessage = userMessage.trim();
    // 截断超长输入，防止单次请求把过多 token 塞进上下文
    const isTruncated = trimmedMessage.length > MAX_MESSAGE_LENGTH;
    const normalizedMessage = isTruncated ? trimmedMessage.slice(0, MAX_MESSAGE_LENGTH) : trimmedMessage;

    const tools = [this.checkProductTool, this.createOrderTool, this.checkOrderTool, this.applyRefundTool];

    const toolMap: Record<string, AgentTool> = {
      check_product: this.checkProductTool,
      create_order: this.createOrderTool,
      check_order: this.checkOrderTool,
      apply_refund: this.applyRefundTool,
    };

    // bindTools：把工具列表注册到模型
    // 注册后模型回复里会包含 tool_calls 字段（当它决定调用工具时）
    const llmWithTools = this.llm.bindTools(tools);

    // 消息历史：Agent 每一轮都能看到完整的对话 + 工具结果
    const messages: BaseMessage[] = [
      // System 消息：设定客服角色和行为规范
      new SystemMessage(
        `你是「极速购」电商平台的 AI 智能客服助手。
你可以使用以下工具帮助客户：
- check_product：查询商品库存和价格
- create_order：为客户创建订单
- check_order：查询订单状态
- apply_refund：申请退款

工作原则：
1. 先用工具获取真实信息，再给客户答复
2. 下单前必须先查询库存确认有货
3. 下单需要知道客户姓名，如果用户没说，主动询问
4. 回答简洁友好，使用中文`,
      ),
      new HumanMessage(normalizedMessage),
    ];

    // 记录每步执行过程（用于前端展示 / 课程演示）
    const steps: string[] = [];
    // 截断会丢掉用户后半句话，明确留痕，避免前端以为消息被完整理解了
    if (isTruncated) {
      steps.push(`⚠️ [提示] 用户消息超过 ${MAX_MESSAGE_LENGTH} 字，已截断`);
    }
    let roundCount = 0;
    let finalAnswer: string | undefined;
    let failed = false;
    let exhausted = false;

    // ── Agent 循环 ──────────────────────────────────────
    // 每一轮：模型看消息历史 → 决定调用工具还是直接回答
    // 直到模型不再调用工具为止（最多 6 轮，防止死循环）
    while (roundCount < MAX_ROUNDS) {
      roundCount++;
      this.logger.debug(`Agent 第 ${roundCount} 轮`);

      let response: AIMessageChunk;
      // 超时只能靠 signal：@langchain/core 不会把 config.timeout 转成中止信号，
      // ChatOllama 也只检查 options.signal，传 timeout 等于没有超时，模型卡住会一直挂着
      const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
      try {
        response = await llmWithTools.invoke(messages, { signal: timeoutSignal });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        steps.push(`❌ [模型失败] ${errMsg}`);
        this.logger.error(`Agent 调用模型失败：${errMsg}`);
        return {
          success: false,
          userMessage,
          steps,
          totalRounds: roundCount,
          answer: '模型服务暂时不可用，请稍后重试',
        };
      }

      // 被中止时 ChatOllama 只是结束流（不抛错），所以拿到结果后要再确认一次
      if (timeoutSignal.aborted) {
        steps.push(`❌ [模型超时] 模型响应超过 ${LLM_TIMEOUT_MS / 1000}s 未返回`);
        this.logger.warn(`Agent 第 ${roundCount} 轮模型超时`);
        return {
          success: false,
          userMessage,
          steps,
          totalRounds: roundCount,
          answer: '模型响应超时，请稍后重试或换一种问法',
        };
      }

      messages.push(response); // 把模型回复加入历史

      // tool_calls 为空 → 模型有了最终答案，退出循环
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const answerText = typeof response.text === 'string' ? response.text.trim() : '';
        // 既没调工具也没给文字（输出为空/被中止）：兜底文案不能算成功，
        // 否则前端会把「没答上来」当成一次正常回答
        if (!answerText) {
          finalAnswer = EMPTY_ANSWER_MESSAGE;
          failed = true;
          steps.push('❌ [空回答] 模型未返回任何内容');
          break;
        }
        finalAnswer = answerText;
        steps.push(`💬 [最终回答] ${finalAnswer}`);
        break;
      }

      // 最后一轮不再执行工具：create_order / apply_refund 有副作用，
      // 执行完又没机会向用户汇总，客户端只会看到「失败」而重复提交（重复下单/重复退款）
      if (roundCount === MAX_ROUNDS) {
        exhausted = true;
        steps.push(`⚠️ [跳过工具] 已达最大轮数，未执行：${response.tool_calls.map((call) => call.name).join('、')}`);
        break;
      }

      // 模型决定调用工具，依次执行所有工具调用
      for (const toolCall of response.tool_calls) {
        steps.push(`🔧 [调用工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
        this.logger.debug(`工具调用：${toolCall.name} ${JSON.stringify(toolCall.args)}`);

        if (!toolCall.id) {
          const errMsg = `工具「${toolCall.name}」缺少调用 ID，无法执行`;
          steps.push(`❌ [错误] ${errMsg}`);
          failed = true;
          finalAnswer = '抱歉，工具调用信息不完整，请稍后重试';
          break;
        }

        // 用 hasOwn 判断：toolCall.name 来自模型输出，直接索引会命中 Object.prototype 上的属性
        const toolFn = Object.hasOwn(toolMap, toolCall.name) ? toolMap[toolCall.name] : undefined;
        if (!toolFn) {
          const errMsg = `工具「${toolCall.name}」不存在`;
          steps.push(`❌ [错误] ${errMsg}`);
          messages.push(new ToolMessage({ content: errMsg, tool_call_id: toolCall.id, status: 'error' }));
          continue;
        }

        try {
          // 执行工具，单个工具失败时不打断整轮，让模型能看到错误并决定如何回复
          // 工具返回值形态由各工具自行决定，显式收窄为 unknown 再转字符串，避免 any 继续扩散
          const toolResult: unknown = await toolFn.invoke(toolCall.args);
          // 工具返回值可能是结构化数据，String() 只会得到 "[object Object]"，模型据此回答会跑偏
          const content =
            typeof toolResult === 'string' ? toolResult : (JSON.stringify(toolResult) ?? '工具已执行但无返回内容');
          steps.push(`✅ [工具结果] ${content}`);
          this.logger.debug(`工具结果：${content}`);
          messages.push(new ToolMessage({ content, tool_call_id: toolCall.id }));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          steps.push(`❌ [工具失败] ${toolCall.name}: ${errMsg}`);
          this.logger.warn(`工具 ${toolCall.name} 执行失败：${errMsg}`);
          messages.push(
            new ToolMessage({
              content: `工具执行失败：${errMsg}`,
              tool_call_id: toolCall.id,
              status: 'error',
            }),
          );
        }
      }

      if (finalAnswer) {
        break;
      }
    }

    if (exhausted) {
      steps.push('❌ [错误] 达到最大执行轮数，任务未完成');
    }

    return {
      success: Boolean(finalAnswer) && !failed && !exhausted,
      userMessage,
      steps, // 完整思考和执行步骤（录视频演示重点）
      totalRounds: roundCount,
      answer: finalAnswer ?? (exhausted ? '处理超时，请稍后重试或换一种问法' : EMPTY_ANSWER_MESSAGE),
    };
  }
}
