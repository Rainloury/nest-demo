# nest-demo

基于 NestJS 12 + Prisma 7 + PostgreSQL 的后端示例项目，附带 LangChain / Ollama 的 AI 能力演示（对话、流式输出、提示词模板），并包含一套可用的 Docker Compose 生产部署方案（NestJS + PostgreSQL + Nginx）。

## 技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | NestJS 12（`@nestjs/platform-express`） | Express 适配器 |
| 语言 | TypeScript 6 | `module` / `moduleResolution` 均为 `nodenext`，纯 ESM |
| ORM | Prisma 7 + `@prisma/adapter-pg` | driver adapter 模式，客户端产物在 `src/generated/prisma` |
| 数据库 | PostgreSQL 18 | 本地可用 docker-compose 起容器 |
| 包管理 | pnpm | 依赖锁文件为 `pnpm-lock.yaml`，不要用 npm / yarn |
| 测试 | vitest 4 | 单测 + e2e，不是 Jest |
| Lint / 格式化 | oxlint + prettier | `pnpm lint` / `pnpm format` |
| AI 能力 | LangChain + `@langchain/ollama` | 见 `models` / `prompts` 模块 |

## 目录结构

```
src/
├── main.ts              # 入口：NestFactory + 全局配置
├── app.module.ts        # 根模块：注册所有功能模块
├── config.ts            # 全局配置集中处（process.env + 默认值）
├── prisma/              # PrismaService + @Global PrismaModule
├── generated/prisma/    # prisma generate 产物：勿改、勿提交、勿在测试里 import
├── user/                # 用户模块（CRUD + 分页 + 关联文章）
├── post/                # 文章模块（CRUD + 按作者 / 发布状态查询）
├── models/              # Ollama 对话：普通 / 系统消息 / 流式 / 输出解析
└── prompts/             # 提示词模板：翻译 / 摘要 / 少样本情感分类
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

### 3. 生成 Prisma Client

```bash
npx prisma generate
```

> `src/generated/prisma` 已被 gitignore，全新 clone 后必须执行这一步，否则会报找不到 `../generated/prisma/client.ts`。

### 4. 执行数据库迁移

```bash
npx prisma migrate dev
```

### 5. 启动

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
pnpm build              # 构建到 dist/
pnpm start:prod         # 运行生产构建
pnpm lint               # oxlint src/ test/
pnpm format             # prettier 格式化

pnpm test               # 单测（vitest run）
pnpm test:watch         # 单测 watch
pnpm test:cov           # 覆盖率
pnpm test:e2e           # e2e（vitest.config.e2e.ts）

npx prisma generate     # 生成 Prisma Client
npx prisma migrate dev  # 改 schema 后：迁移 + 自动 generate
```

## 接口一览

所有路由前缀直接挂在根路径下（无全局 `/api` 前缀）。

### 用户 `/user`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/user/create` | 创建用户；邮箱重复返回 409 |
| GET | `/user/list` | 分页列表，支持 `page` / `size` / `name` / `role` 过滤 |
| GET | `/user/:id` | 用户详情，含该用户的文章，`id` 须为正整数 |
| PUT | `/user/:id` | 更新用户 |
| DELETE | `/user/:id` | 删除用户 |

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

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/post/create` | 创建文章；`authorId` 不存在返回 404 |
| GET | `/post/list` | 列表，可选 `?published=true\|false` 过滤 |
| GET | `/post/author/:authorId` | 查询指定作者的文章 |
| GET | `/post/:id` | 文章详情 |
| PUT | `/post/:id` | 更新文章 |
| PATCH | `/post/:id/publish` | 发布文章（幂等） |
| DELETE | `/post/:id` | 删除文章 |

查询文章时会带上作者信息，但只暴露 `id` / `name` / `email` / `role`，不含密码。

### AI 对话 `/models`

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| POST | `/models/chat` | `{ "message": "..." }` | 普通问答 |
| POST | `/models/chat-system` | `{ "system": "...", "message": "..." }` | 带系统消息的问答 |
| POST | `/models/chat-stream` | `{ "system": "...", "message": "..." }` | SSE 流式输出，以 `data: [DONE]` 结束 |
| POST | `/models/chat-parser` | `{ "message": "..." }` | 经 `StringOutputParser` 解析后返回字符串 |

### 提示词 `/prompts`

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| POST | `/prompts/translate` | `{ "text": "...", "targetLanguage": "en" }` | 翻译 |
| POST | `/prompts/summarize` | `{ "text": "...", "maxWords": 100 }` | 摘要 |
| POST | `/prompts/classify` | `{ "text": "..." }` | 少样本情感分类（积极 / 消极 / 中立） |

AI 相关配置来自环境变量（见 `src/config.ts`）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 服务地址 |
| `OLLAMA_CHAT_MODEL` | `llama2` | 对话模型 |
| `OLLAMA_EMBED_MODEL` | `llama2` | 向量模型 |
| `OLLAMA_TEMPERATURE` | `0.7` | 采样温度 |

## 响应与错误约定

| 场景 | 形状 |
| --- | --- |
| 单条查询 / 写操作 | `{ success, message, timestamp, data? }` |
| 错误 | Nest 内置异常，body 沿用上面的对象形状 |

Prisma 异常会被翻译成对应的 HTTP 语义：

- `P2002` 唯一约束冲突 → `409 ConflictException`（从 `meta` 里识别冲突字段，给出可读信息）
- `P2025` 记录不存在 → `404 NotFoundException`
- 入参非法（如 `id` 非正整数）→ `400 BadRequestException`，在进库前拦截

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

> `DATABASE_URL` 里的主机名是 compose 服务名 `postgres`，不是 `localhost`。

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

- 应用直连：`http://<host>:3000`
- 经 Nginx：`http://<host>/`（健康检查 `GET /health`）

Dockerfile 说明：多阶段构建（builder → runner），镜像内使用固定版本的 pnpm，按 `pnpm-lock.yaml` 安装依赖；Prisma Client 在构建阶段生成并编译进 `dist`，运行阶段只装生产依赖。

## 开发约定

更完整的仓库规范见 [`AGENTS.md`](./AGENTS.md)，重点：

- **相对导入必须带 `.ts` 扩展名**（编译时由 `rewriteRelativeImportExtensions` 改写成 `.js`）。
- **Prisma 客户端只从 `src/generated/prisma` 导入**，不要用 `@prisma/client`。
- **不要手改 `src/generated/**`**，改 `prisma/schema.prisma` 后重新 generate。
- 依赖注入一律构造器注入 + `private readonly`；`PrismaModule` 是 `@Global()`，功能模块不要重复 import。
- 提交前至少跑 `npx tsc --noEmit -p tsconfig.json` 与 `pnpm lint`；改了逻辑 / 接口再跑 `pnpm test`。

## 已知技术债

以下为当前真实存在的问题，不是规范：

- `test/app.e2e-spec.ts` 仍指向旧路由并断言旧的返回结构，运行会失败。
- `.env.production` 内含真实数据库密码，但 `.gitignore` 只忽略了 `.env` / `.env.*.local`，并未忽略它，提交时需特别注意。
- `models` / `prompts` 的响应结构尚未统一为「响应与错误约定」中的形状，且仍使用内联匿名对象作为 Body 类型。
- 未启用全局 `ValidationPipe`，DTO 目前只是编译期标注，运行时校验依赖入参钳制与数据库约束。
- `eslint.config.mjs` 与 `oxlint.json` 两套 lint 并存，实际只跑 oxlint。

## License

UNLICENSED（私有项目）。
