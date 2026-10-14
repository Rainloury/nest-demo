# nest-demo

基于 NestJS 12 + Prisma 7 + PostgreSQL 的后端示例项目，包含用户 / 文章 CRUD、健康检查，以及基于 LangChain / Ollama 的对话、流式输出、提示词链、Agent、上下文记忆、RAG 和工具调用示例。

项目同时提供一套可用的 Docker Compose 部署方案（NestJS + PostgreSQL + Nginx）。

## 技术栈

| 项            | 选型                                    | 说明                                                                    |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 框架          | NestJS 12（`@nestjs/platform-express`） | Express 适配器                                                          |
| 语言          | TypeScript 6                            | `module` / `moduleResolution` 均为 `nodenext`，纯 ESM                   |
| ORM           | Prisma 7 + `@prisma/adapter-pg`         | driver adapter 模式，客户端产物在 `src/generated/prisma`                |
| 数据库        | PostgreSQL 18                           | 本地可用 docker-compose 起容器                                          |
| 包管理        | pnpm                                    | 依赖锁文件为 `pnpm-lock.yaml`，不要用 npm / yarn                        |
| 测试          | vitest 4                                | 单测 + e2e，不是 Jest                                                   |
| Lint / 格式化 | oxlint + prettier                       | `pnpm lint` / `pnpm format`                                             |
| AI 能力       | LangChain + `@langchain/ollama` + Zod   | `models` / `prompts` / `chains` / `agents` / `memory` / `rag` / `tools` |

## 功能概览

| 模块     | 路由          | 能力                                         |
| -------- | ------------- | -------------------------------------------- |
| 健康检查 | `GET /health` | 检查应用进程和 PostgreSQL 连接               |
| 用户     | `/user`       | 用户 CRUD、分页和条件查询                    |
| 文章     | `/post`       | 文章 CRUD、按作者查询、发布状态              |
| 模型对话 | `/models`     | 普通对话、系统消息、SSE 流式输出、输出解析   |
| 提示词   | `/prompts`    | 翻译、摘要、少样本情感分类                   |
| 链       | `/chains`     | 文章润色、博客生成、客服问题路由             |
| Agent    | `/agents`     | 多轮工具调用、商品 / 订单 / 退款演示         |
| 记忆     | `/memory`     | 多轮会话、历史查询、会话清空、SSE 流式输出   |
| RAG      | `/rag`        | 内存向量库、文档加载、相似度检索、知识库问答 |
| 工具调用 | `/tools`      | Function Calling 演示、商品和订单工具        |

## 目录结构

```text
src/
├── main.ts              # 入口：NestFactory + 全局配置
├── app.module.ts        # 根模块：注册所有功能模块
├── app.controller.ts    # GET /health
├── app.service.ts       # 健康检查：Prisma SELECT 1
├── config.ts            # 全局配置集中处（process.env + 默认值）
├── prisma/              # PrismaService + @Global PrismaModule
├── generated/prisma/    # prisma generate 产物：勿改、勿提交、勿在测试里 import
├── user/                # 用户模块（CRUD + 分页 + 关联文章）
├── post/                # 文章模块（CRUD + 按作者 / 发布状态查询）
├── models/              # Ollama 对话：普通 / 系统消息 / 流式 / 输出解析
├── prompts/             # 提示词模板：翻译 / 摘要 / 少样本情感分类
├── chains/              # 多步骤链：润色 / 博客生成 / 条件路由
├── agents/              # Agent 循环和工具调用示例
├── memory/              # 内存会话存储和多轮对话
├── rag/                 # 内存向量库和 RAG 问答
└── tools/               # Function Calling 工具调用示例
prisma/
├── schema.prisma        # 数据模型（User / Post）
└── migrations/          # 迁移 SQL
nginx/                   # Nginx 反向代理配置
test/                    # e2e 测试（*.e2e-spec.ts）
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少确认 `DATABASE_URL` 指向可用的 PostgreSQL：

```dotenv
DATABASE_URL="postgresql://user:password@localhost:5432/nest_demo?schema=public"
```

若本机解析不了 Prisma 引擎官方 CDN，保留 `.env.example` 里已给出的镜像地址：

```dotenv
PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"
```

### 3. 准备 Ollama

不使用 AI 路由时可以跳过；调用 `/models`、`/prompts`、`/chains`、`/agents`、`/memory`、`/rag`、`/tools` 前需要本机 Ollama 服务可用，并拉取 `.env` 中配置的对话模型和向量模型。

```dotenv
OLLAMA_HOST="http://127.0.0.1:11434"
OLLAMA_CHAT_MODEL="qwen3.5:4b"
OLLAMA_EMBED_MODEL="mxbai-embed-large:latest"
OLLAMA_TEMPERATURE="0.2"
```

### 4. 生成 Prisma Client

```bash
npx prisma generate
```

> `src/generated/prisma` 已被 gitignore，全新 clone 后必须执行这一步，否则会报找不到 `../generated/prisma/client.ts`。

### 5. 执行数据库迁移

```bash
npx prisma migrate dev
```

### 6. 启动

```bash
pnpm start:dev      # 开发（watch）
pnpm start          # 普通启动
pnpm start:prod     # 运行编译产物 dist/main
```

服务默认监听 `http://localhost:3000`（可用 `PORT` 覆盖）。

## 命令速查

```bash
pnpm install            # 安装依赖
pnpm start:dev          # 开发模式（watch）
pnpm start:debug        # 调试模式
pnpm build              # 构建到 dist/
pnpm start:prod         # 运行生产构建
pnpm lint               # oxlint src/ test/
pnpm format             # prettier 格式化 src/ 和 test/ 下的 TypeScript

pnpm test               # 单测（vitest run）
pnpm test:watch         # 单测 watch
pnpm test:cov           # 覆盖率
pnpm test:debug         # 调试单测
pnpm test:e2e           # e2e（vitest.config.e2e.ts）

npx prisma generate     # 生成 Prisma Client
npx prisma migrate dev  # 改 schema 后：迁移 + 自动 generate
```

## 接口一览

所有路由前缀直接挂在根路径下（无全局 `/api` 前缀）。根路径 `/` 不再提供接口，应用级探活请使用 `GET /health`。

### 健康检查

| 方法 | 路径      | 说明                                                            |
| ---- | --------- | --------------------------------------------------------------- |
| GET  | `/health` | 查询数据库 `SELECT 1`；正常返回 `200`，数据库不可用时返回 `503` |

正常响应：

```json
{
  "success": true,
  "message": "服务健康",
  "timestamp": "2026-10-14T00:00:00.000Z",
  "data": {
    "status": "ok",
    "database": "up",
    "uptime": 12.34
  }
}
```

### 用户 `/user`

| 方法   | 路径           | 说明                                                  |
| ------ | -------------- | ----------------------------------------------------- |
| POST   | `/user/create` | 创建用户；邮箱重复返回 `409`                          |
| GET    | `/user/list`   | 分页列表，支持 `page` / `size` / `name` / `role` 过滤 |
| GET    | `/user/:id`    | 用户详情，含该用户的文章，`id` 须为正整数             |
| PUT    | `/user/:id`    | 更新用户                                              |
| DELETE | `/user/:id`    | 删除用户                                              |

列表返回：

```json
{
  "pagination": { "page": 1, "size": 10, "total": 0, "totalPages": 0, "hasNext": false, "hasPrev": false },
  "list": []
}
```

单条查询 / 写操作返回：

```json
{ "success": true, "message": "创建用户成功", "timestamp": "2026-10-14T00:00:00.000Z", "data": {} }
```

> 用户接口已排除 `password` 字段，不会返回给客户端。

### 文章 `/post`

| 方法   | 路径                     | 说明                                       |
| ------ | ------------------------ | ------------------------------------------ |
| POST   | `/post/create`           | 创建文章；`authorId` 不存在返回 `404`      |
| GET    | `/post/list`             | 列表，可选 `?published=true \| false` 过滤 |
| GET    | `/post/author/:authorId` | 查询指定作者的文章                         |
| GET    | `/post/:id`              | 文章详情                                   |
| PUT    | `/post/:id`              | 更新文章                                   |
| PATCH  | `/post/:id/publish`      | 发布文章（幂等）                           |
| DELETE | `/post/:id`              | 删除文章                                   |

查询文章时会带上作者信息，但只暴露 `id` / `name` / `email` / `role`，不含密码。

### AI 对话 `/models`

| 方法 | 路径                  | 请求体                                  | 说明                                     |
| ---- | --------------------- | --------------------------------------- | ---------------------------------------- |
| POST | `/models/chat`        | `{ "message": "..." }`                  | 普通问答                                 |
| POST | `/models/chat-system` | `{ "system": "...", "message": "..." }` | 带系统消息的问答                         |
| POST | `/models/chat-stream` | `{ "system": "...", "message": "..." }` | SSE 流式输出，以 `data: [DONE]` 结束     |
| POST | `/models/chat-parser` | `{ "message": "..." }`                  | 经 `StringOutputParser` 解析后返回字符串 |

非流式接口以 `{ response: ... }` 包裹服务返回值。

### 提示词 `/prompts`

| 方法 | 路径                 | 请求体                                      | 说明                                 |
| ---- | -------------------- | ------------------------------------------- | ------------------------------------ |
| POST | `/prompts/translate` | `{ "text": "...", "targetLanguage": "en" }` | 翻译                                 |
| POST | `/prompts/summarize` | `{ "text": "...", "maxWords": 100 }`        | 摘要                                 |
| POST | `/prompts/classify`  | `{ "text": "..." }`                         | 少样本情感分类（积极 / 消极 / 中立） |

### 链 `/chains`

| 方法 | 路径             | 请求体                                  | 返回字段                                                   |
| ---- | ---------------- | --------------------------------------- | ---------------------------------------------------------- |
| POST | `/chains/polish` | `{ "article": "..." }`                  | `original` / `polished`                                    |
| POST | `/chains/blog`   | `{ "keywords": "...", "style": "..." }` | `keywords` / `style` / `outline` / `article` / `seoTitles` |
| POST | `/chains/router` | `{ "question": "..." }`                 | `question` / `category` / `answer`                         |

`/chains/polish` 会先分析文章问题，再根据问题列表润色原文；`/chains/blog` 按大纲、正文、SEO 标题顺序执行；`/chains/router` 先分类问题，再选择对应客服提示词生成回答。

### Agent `/agents`

| 方法 | 路径          | 请求体                 | 说明                   |
| ---- | ------------- | ---------------------- | ---------------------- |
| POST | `/agents/run` | `{ "message": "..." }` | 运行带工具调用的 Agent |

返回结构：

```json
{
  "success": true,
  "userMessage": "...",
  "steps": ["✅ [工具结果] ...", "💬 [最终回答] ..."],
  "totalRounds": 2,
  "answer": "..."
}
```

当前内置工具：

- `check_product`：查询商品库存和价格
- `create_order`：创建订单，校验库存和数量
- `check_order`：查询订单状态
- `apply_refund`：提交退款申请

约束：单次消息最多 1000 个字符（超长会截断并写入 `steps`），最多执行 6 轮工具调用，单轮模型调用超时 30 秒。输入为空、模型失败、超时或达到最大轮数时，HTTP 状态仍可能为 `200`，业务结果通过 `success: false` 和 `answer` 表达。

### 记忆 `/memory`

| 方法   | 路径                         | 请求体 / 参数                              | 说明                                                    |
| ------ | ---------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| POST   | `/memory/chat`               | `{ "sessionId": "...", "message": "..." }` | 多轮对话                                                |
| POST   | `/memory/chat-stream`        | `{ "sessionId": "...", "message": "..." }` | SSE 流式对话，结束时发送 `data: {"text":"[DONE]", ...}` |
| GET    | `/memory/history/:sessionId` | `sessionId`                                | 查询会话历史                                            |
| DELETE | `/memory/session/:sessionId` | `sessionId`                                | 清空会话                                                |
| GET    | `/memory/sessions`           | 无                                         | 列出当前内存中的会话                                    |

约束：

- 会话存储在当前进程内存中，服务重启后丢失，也不会在多个实例之间共享。
- 最多保留 500 个会话，空闲 30 分钟自动淘汰；最久未活跃的会话会被 LRU 清理。
- 单个会话最多保留 10 轮历史对话，`sessionId` 最多 128 个字符，`message` 最多 2000 个字符（超长截断）。
- 同一个 `sessionId` 的请求会串行处理，避免并发写坏会话历史。
- 非字符串或空白的 `sessionId` / `message` 返回 `400`；流式请求已在输出内容后失败时，会返回 SSE 错误事件并继续发送 `[DONE]`。

### RAG `/rag`

| 方法   | 路径          | 请求体 / 参数                                                           | 说明                                 |
| ------ | ------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| POST   | `/rag/load`   | `{ "documents": [{ "id": "...", "content": "...", "source": "..." }] }` | 将文档分块、向量化并加载到内存向量库 |
| GET    | `/rag/status` | 无                                                                      | 查看知识库状态和已加载文档数         |
| POST   | `/rag/search` | `{ "query": "...", "topK": 3 }`                                         | 纯向量检索，不调用对话模型           |
| POST   | `/rag/query`  | `{ "question": "...", "topK": 3 }`                                      | 先检索，再让模型基于检索结果回答     |
| DELETE | `/rag/clear`  | 无                                                                      | 清空内存向量库                       |

约束与错误语义：

- 知识库是进程内内存实现，服务重启后丢失，也不会在多个实例之间共享。
- `documents` 必须是非空数组；单次最多 100 篇，每篇 `content` 最多 10000 个字符，分块总数最多 2000。
- 文本按 500 个字符分块、重叠 50 个字符；每篇文档使用 `source`，未提供时回退到 `id`。
- `query` / `question` 最多 1000 个字符（超长截断）。
- `topK` 会被规范化为 `1..10`，默认值为 `3`；非法值回退到默认值。
- 知识库为空时调用 `/rag/search` 或 `/rag/query` 返回 `422`；向量化、检索或模型调用失败返回 `503`，调用超时时间为 30 秒。

### 工具调用 `/tools`

| 方法 | 路径         | 请求体                 | 说明                                      |
| ---- | ------------ | ---------------------- | ----------------------------------------- |
| POST | `/tools/run` | `{ "message": "..." }` | 使用 Function Calling 调用商品 / 订单工具 |

返回结构：

```json
{
  "userMessage": "查询 iPhone 16 的库存",
  "toolCalls": [{ "tool": "check_inventory", "args": { "productName": "iPhone 16" }, "result": {} }],
  "finalAnswer": "..."
}
```

约束：单次消息最多 1000 个字符（超长截断），最多执行 3 轮工具调用，模型调用超时 30 秒。内置工具包括 `check_inventory`、`create_order`、`check_order`。

## AI 配置

AI 配置从环境变量读取，集中定义在 `src/config.ts`。README 中的“配置默认值”指未设置环境变量时的代码回退值；“`.env.example` 示例值”是复制 `.env.example` 后的推荐示例。

| 变量                 | 配置默认值               | `.env.example` 示例值      | 说明                        |
| -------------------- | ------------------------ | -------------------------- | --------------------------- |
| `OLLAMA_HOST`        | `http://localhost:11434` | `http://127.0.0.1:11434`   | Ollama 服务地址             |
| `OLLAMA_CHAT_MODEL`  | `llama2`                 | `qwen3.5:4b`               | 对话 / Agent / RAG 生成模型 |
| `OLLAMA_EMBED_MODEL` | `llama2`                 | `mxbai-embed-large:latest` | RAG 向量化模型              |
| `OLLAMA_TEMPERATURE` | `0.7`                    | `0.2`                      | 采样温度                    |

> 使用 RAG 前请确保 `OLLAMA_EMBED_MODEL` 对应的向量模型已在 Ollama 中可用；否则 `/rag/load`、`/rag/search`、`/rag/query` 会返回 `503`。

## 响应与错误约定

数据库相关模块沿用以下响应形状：

| 场景              | 形状                                     |
| ----------------- | ---------------------------------------- |
| 分页列表          | `{ pagination, list }`                   |
| 非分页列表        | `{ success, message, timestamp, data }`  |
| 单条查询 / 写操作 | `{ success, message, timestamp, data? }` |
| 错误              | Nest 内置异常，body 沿用上面的对象形状   |

HTTP 语义：

| 状态码 | 场景                                                     |
| ------ | -------------------------------------------------------- |
| 400    | 入参不合法，例如 `id` 非正整数、空字符串或错误的字段类型 |
| 404    | 记录不存在                                               |
| 409    | Prisma `P2002` 唯一约束冲突，例如邮箱重复                |
| 422    | RAG 知识库为空                                           |
| 503    | 数据库 / Ollama 等上游不可用或调用超时                   |

Prisma 异常会被翻译成对应的 HTTP 语义：

- `P2002` 唯一约束冲突 -> `409 ConflictException`（从 `meta` 中识别冲突字段，给出可读信息）
- `P2025` 记录不存在 -> `404 NotFoundException`
- 入参非法（如 `id` 非正整数）-> `400 BadRequestException`，在进库前拦截

部分 AI 模块为了便于演示，会把业务失败放在响应体内处理，例如 `/agents/run` 的 `success: false` 和 `/tools/run` 的 `finalAnswer`；不能只依赖 HTTP 状态码判断这些接口是否成功。

## 测试

测试基于 vitest（`globals: true`，无需 import `describe` / `it` / `expect` / `vi`）。

```bash
pnpm test        # 单测：只 new Service，Prisma 用 vi.fn() 造假对象，不连真实数据库
pnpm test:e2e    # e2e：必须 overrideProvider(PrismaService)，否则 onModuleInit 会连真实库
pnpm test:cov    # 覆盖率
```

约定：

- 单测文件 `*.spec.ts` 与源文件同目录；e2e 文件 `*.e2e-spec.ts` 放 `test/`。
- 不要在测试里 import `src/generated`（数千行生成代码会显著拖慢用例）。
- 两个配置均放开超时到 60s，因为 `Test.createTestingModule().compile()` 冷启动可能较慢。

当前全量单测并非全绿，失败项记录在「已知技术债」中。

## Docker 部署

`docker-compose.yml` 定义了三个服务：`postgres`（PostgreSQL 18）、`nestjs`（应用）、`nginx`（反向代理 80/443）。

### 1. 准备生产环境变量

```bash
cp .env.example .env.production   # 按需替换成真实值
```

生产配置需包含：

```dotenv
POSTGRES_USER=nestjs_user
POSTGRES_PASSWORD=<强密码>
POSTGRES_DB=nest_demo
DATABASE_URL="postgresql://nestjs_user:<密码>@postgres:5432/nest_demo?schema=public"
NODE_ENV=production
PORT=3000
```

> `DATABASE_URL` 里的主机名是 compose 服务名 `postgres`，不是 `localhost`。`.env.production` 已在 `.gitignore` 中，不要提交真实密码。

### 2. 构建并启动

```bash
docker compose --env-file .env.production up -d --build
```

compose 顶层的 `${...}` 插值只读当前目录 `.env` 或 `--env-file` 指定的文件，所以需要用 `--env-file` 显式传入生产配置。

### 3. 执行迁移

容器启动后，在 `nestjs` 容器内执行：

```bash
docker compose exec nestjs npx prisma migrate deploy
```

### 4. 访问

- 应用直连：`http://<host>:3000/health`，业务路由例如 `http://<host>:3000/user/list`
- 经 Nginx：`http://<host>/health`，业务路由例如 `http://<host>/user/list`

Dockerfile 说明：多阶段构建（builder -> runner），镜像内使用固定版本的 pnpm，按 `pnpm-lock.yaml` 安装依赖；Prisma Client 在构建阶段生成并编译进 `dist`，运行阶段只装生产依赖。

## 开发约定

更完整的仓库规范见 [`AGENTS.md`](./AGENTS.md)，重点：

- **相对导入必须带 `.ts` 扩展名**（编译时由 `rewriteRelativeImportExtensions` 改写成 `.js`）。
- **Prisma 客户端只从 `src/generated/prisma` 导入**，不要用 `@prisma/client`。
- **不要手改 `src/generated/**`**，改 `prisma/schema.prisma` 后重新 generate。
- 依赖注入一律构造器注入 + `private readonly`；`PrismaModule` 是 `@Global()`，功能模块不要重复 import。
- 提交前至少跑 `npx tsc --noEmit -p tsconfig.json` 与 `pnpm lint`；改了逻辑 / 接口再跑 `pnpm test`。
- 不要用 `console.log` 代替日志或错误处理；不要吞掉底层异常。

## 已知技术债

以下为当前真实存在的问题，不是规范：

- `test/app.e2e-spec.ts` 仍指向旧路由并断言旧的返回结构，直接运行会失败。
- `src/chains/chains.controller.spec.ts` 和 `src/memory/memory.controller.spec.ts` 只注册了 controller，没有提供对应的 `ChainsService` / `MemoryService`，当前单测会因依赖注入失败而报错。
- `models` / `prompts` 的响应结构尚未统一为「响应与错误约定」中的形状；多个 AI controller 仍使用内联匿名对象作为 Body 类型。
- 未启用全局 `ValidationPipe`，DTO 目前只是编译期标注，运行时校验依赖各模块自己的入参钳制与数据库约束。
- `/chains` 当前没有统一的运行时入参校验、超时和上游错误翻译；上游模型异常可能直接冒泡为 `500`。
- `src/post/post.module.ts` 与 `src/app.module.ts` 对 post 模块的导入使用 `.js` 后缀，其余模块使用 `.ts`，与当前约定不一致。
- `eslint.config.mjs` 与 `oxlint.json` 两套 lint 并存，实际只跑 oxlint。
- `memory` 和 `rag` 使用进程内内存存储，重启或多实例部署后会丢失数据，也不具备水平扩展共享能力。

## License

UNLICENSED（私有项目）。
