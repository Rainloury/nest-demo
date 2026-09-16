# AGENTS.md

> 面向 AI 编码助手（以及新加入的开发者）的仓库规范。
> 动手改代码前先读这份文件；当它与「通用的 NestJS 最佳实践」冲突时，**以本文件为准**。
> 本文档描述的是**本仓库当前真实约定**，末尾第 12 节列出了「已知技术债」——那些地方**不是**规范，不要照抄。

---

## 1. 技术栈

| 项 | 选型 | 备注 |
| --- | --- | --- |
| 框架 | NestJS 12（`@nestjs/platform-express`） | Express 适配器 |
| 语言 | TypeScript 6，`module` / `moduleResolution` 均为 `nodenext` | 纯 ESM（`package.json` 有 `"type": "module"`） |
| ORM | Prisma 7 + `@prisma/adapter-pg`（driver adapter） | 客户端产物在 `src/generated/prisma` |
| 数据库 | PostgreSQL 18（docker-compose 起容器） | schema 见 `prisma/schema.prisma` |
| 包管理 | pnpm（有 `pnpm-lock.yaml`、`pnpm-workspace.yaml`） | **不要**用 npm / yarn |
| 测试 | vitest 4（单测 + e2e） | 不是 Jest |
| Lint / 格式化 | oxlint（`pnpm lint`）+ prettier（`pnpm format`） | 另有 `eslint.config.mjs`，见第 12 节 |
| AI 能力 | LangChain + `@langchain/ollama` | `models` / `prompts` 模块 |

## 2. 命令速查

```bash
pnpm install                 # 安装依赖
cp .env.example .env         # 首次：配置 DATABASE_URL 等（.env 已 gitignore）
npx prisma generate          # 首次：生成 Prisma Client（src/generated 已 gitignore）
npx prisma migrate dev       # 改 schema 后：迁移 + 自动 generate

pnpm start:dev               # 开发（watch）
pnpm build                   # 构建到 dist/
pnpm lint                    # oxlint src/ test/
pnpm format                  # prettier --write

pnpm test                    # 单测（vitest run）
pnpm test:watch              # 单测 watch
pnpm test:cov                # 覆盖率
pnpm test:e2e                # e2e（vitest.config.e2e.ts）
```

> 全新 clone 后如果直接 `pnpm start` 报模块找不到（`../generated/prisma/client.ts`），原因就是漏了 `npx prisma generate`。

## 3. 硬性约定（违反会直接编译失败或运行异常）

### 3.1 相对导入必须带 `.ts` 扩展名

`tsconfig.json` 开了 `rewriteRelativeImportExtensions`，Prisma generator 也配了 `importFileExtension = "ts"`：源码写 `.ts`，编译时自动改写成 `.js`。

```ts
import { PrismaService } from '../prisma/prisma.service.ts';   // ✅
import { PrismaService } from '../prisma/prisma.service';      // ❌ TS2835
```

同理禁止写 `.js` 后缀（会和「源码就是 .ts」的解析规则打架）。

### 3.2 Prisma 客户端只从 `src/generated/prisma` 导入

Prisma 7 用新的 `prisma-client` generator，输出到项目内而不是 `node_modules/@prisma/client`：

```ts
import { Prisma, PrismaClient } from '../generated/prisma/client.ts';  // ✅
import { PrismaClient } from '@prisma/client';                         // ❌
```

需要用 `Prisma.PrismaClientKnownRequestError` 这类运行时类时，也从上面这个路径取 `Prisma` 命名空间。

### 3.3 不要手改 `src/generated/**`

那是 `prisma generate` 的产物（已在 `.gitignore` 第 65 行忽略）。要变，就改 `prisma/schema.prisma` 再重新 generate。

### 3.4 依赖注入写法

```ts
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
}
```

- 一律构造器注入，成员加 `private readonly`。
- `PrismaModule` 标了 `@Global()`，**功能模块不要重复 `imports: [PrismaModule]`**，直接注入 `PrismaService` 即可。

### 3.5 ESM 环境注意事项

- 可用顶层 `await`（`main.ts` 就是 `await bootstrap();`）。
- 不要用 `require` / `module.exports` / `__dirname`；要路径用 `import.meta.dirname`（参考 `eslint.config.mjs`）。

## 4. 目录结构

```
src/
├── main.ts                 # 入口：NestFactory + 全局配置
├── app.module.ts           # 根模块：所有功能模块在此注册
├── config.ts               # 全局配置集中处（process.env + 默认值）
├── prisma/                 # PrismaService + @Global PrismaModule
├── generated/prisma/       # generate 产物：勿改、勿提交、勿在测试里 import
└── <feature>/              # 功能模块，如 user / article / models / prompts
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    ├── <feature>.controller.spec.ts
    ├── <feature>.service.spec.ts
    └── dto/
        └── create-<feature>.dto.ts
```

新增一个功能模块的标准动作：

1. 建 `<feature>/` 目录，写 module + controller + service 三件套；
2. 入参放 `dto/`，**不要**用内联匿名对象当 Body 类型；
3. 在 `app.module.ts` 的 `imports` 注册新模块；
4. spec 与源文件同目录，e2e 放 `test/`。

## 5. 分层职责

| 层 | 只做这些 | 不要做 |
| --- | --- | --- |
| Controller | 路由声明、参数装饰器（`@Query` / `@Param` / `@Body`）、入参边界钳制、调用 service | 不写业务逻辑、不直接注入 Prisma、不在这里映射 Prisma 错误 |
| Service | 业务逻辑、Prisma 调用、把底层错误翻译成语义化的 HTTP 异常 | 不接收 `Request` / `Response`、不关心路由路径 |
| DTO | 定义请求体形状 | 不写校验逻辑（当前项目未接 `ValidationPipe`，见第 12 节） |

Controller 保持"薄"的正面例子见 `src/user/user.controller.ts`（钳制 `page` / `size` 后在 service 里分页）。

## 6. 响应与错误处理（本仓库既有实现，必须沿用）

### 6.1 响应体形状

| 场景 | 形状 |
| --- | --- |
| 列表 | `{ page, size, total, data, message }` |
| 单条查询 / 写操作 | `{ success, message, timestamp, data? }` |
| 错误 | 抛 Nest 内置异常，body 用上面的对象形状（不要只丢一个 string） |

```ts
throw new ConflictException({
  success: false,
  message: `邮箱 ${dto.email} 已被注册`,
  timestamp: new Date().toISOString(),
});
```

### 6.2 Prisma 异常必须翻译成 HTTP 语义

| 底层错误 | HTTP | 做法 |
| --- | --- | --- |
| `P2002` 唯一约束冲突 | 409 `ConflictException` | 从 `meta` 里识别是哪个字段冲突，给出「邮箱 xxx 已被注册」这类可读信息 |
| `P2025` 记录不存在 | 404 `NotFoundException` | `findFirstOrThrow` / `findUniqueOrThrow` 查不到时 |
| 入参不合法 | 400 `BadRequestException` | **进数据库之前**拦住（例如 id 必须是正整数，`Number('abc')` 是 `NaN`） |
| 其它（连接失败、超时…） | 原样 `throw` | 交给 Nest 全局异常过滤器返回 500，**不要吞** |

可直接参考 `src/user/user.service.ts`：

- `collectConflictSignals()`：`P2002` 的 `meta` 结构在不同引擎/版本下不一样，它把多处线索汇总后判定字段。**注意 Prisma 7 + driver adapter 根级没有 `meta.target`**，真正的约束名在 `meta.driverAdapterError.cause.constraint.index` 或 `cause.originalMessage` 里。
- `createUser()` 捕获 `P2002` → 409；`getUserById()` 捕获 `P2025` → 404，非预期错误原样抛出。

### 6.3 分页

```ts
const skip = (currentPage - 1) * pageSize;
const [total, data] = await this.prisma.$transaction([
  this.prisma.user.count(),
  this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
]);
```

- `total` 与当前页数据用 **同一个事务** 查询，保证同一快照（不要用 `Promise.all`）。
- `skip` 从 0 起算；`page` / `size` 的钳制放在 controller。

### 6.4 敏感字段

- 任何返回给客户端的 User 数据都要排除 `password`（用 `select` 或返回前剔除）。
- 查询默认会带出全部字段，**不要**直接把 Prisma 原始结果丢给客户端。

## 7. 测试规范

- 跑的是 **vitest**，不是 jest。`vitest.config.ts` 开了 `globals: true`，`describe` / `it` / `expect` / `vi` **无需 import**。
- 单测文件 `*.spec.ts` 与源文件同目录；e2e 文件 `*.e2e-spec.ts` 放 `test/`。
- 单测：只 `new` Service，Prisma 用 `vi.fn()` 造假对象，**不连真实数据库**。
- e2e：必须 `.overrideProvider(PrismaService).useValue(mockPrisma)`，否则 `PrismaModule` 的 `onModuleInit` 会去 `$connect()` 真实库。
- **不要在测试里 import `src/generated`**（数千行生成代码，转译会把用例拖到几分钟）。两个 vitest 配置都已 `exclude: ['**/generated/**']`。
- 两个配置都放宽了超时（`hookTimeout` / `testTimeout` 60s），因为 `Test.createTestingModule().compile()` 冷启动可能 15s+。**不要因为"慢"就删掉这些配置**。
- 新增接口或改动返回结构后，同步更新对应 spec。

## 8. 代码风格

- prettier（`.prettierrc`）：单引号、加分号、2 空格、`printWidth: 120`、`trailingComma: all`、`arrowParens: always`。
- 提交前至少跑：`npx tsc --noEmit -p tsconfig.json` 与 `pnpm lint`。
- `@typescript-eslint/no-explicit-any` 是关掉的，`no-floating-promises` 是 warn：`any` 允许但别滥用，新代码优先 `unknown` + 收窄；所有 Promise 都要 `await` 或显式处理。
- 注释写**「为什么」**，用中文；不要逐行复述代码在做什么。
- 命名：文件名 kebab-case，类名 PascalCase，Prisma model 用单数首字母大写（`User` / `Article`）。

## 9. AI 协作准则（vibe coding 硬性要求）

必须做：

1. **先读后改**：改任何文件前先读它的当前内容，不要凭记忆或猜测下手。
2. **改完自检**：`npx tsc --noEmit -p tsconfig.json` 必跑；改了逻辑/接口再跑 `pnpm test`。
3. **改动最小化**：只动与需求相关的代码，不顺手重构无关文件、不批量重排 import、不格式化整份文件。
4. **新增依赖要说明**：用 `pnpm add` 并解释用途与影响；装完确认 `package.json` / `pnpm-lock.yaml` 之外没有多余改动（pnpm 可能往 `pnpm-workspace.yaml` 写 `allowBuilds` 占位）。
5. **破坏性操作先确认**：`rm -rf`、`git reset --hard`、`prisma migrate reset`、`DROP`、强推等，必须先问。
6. **不主动产出**：不新建 `.md` 文档、不主动 `git commit`，除非明确要求。
7. **不碰 `.codebuddy/`**：那是项目数据目录，不是缓存。
8. **说清影响面**：改动跨多个文件时，收尾给一句「改了哪些文件、影响什么」。

禁止：

- 编造未验证的 API 行为。涉及框架/依赖版本相关细节（如 Prisma 7 的 `error.meta` 结构）时，去 `node_modules` 源码或官方文档确认后再写。
- 用 `console.log` 代替日志或错误处理；调试用的临时输出提交前删掉。
- 在测试里连真实数据库。
- 静默吞异常（`catch {}` 什么都不做），或把底层错误原样暴露给客户端。
- 为了让测试通过而放宽断言 / 删测试用例。

## 10. 常见坑速查

| 症状 | 原因 | 正确做法 |
| --- | --- | --- |
| 报错提示相对导入需要扩展名 / TS2835 | 漏了 `.ts` | 补上 `.ts` |
| 找不到 `../generated/prisma/client.ts` | 没跑 generate | `npx prisma generate` |
| `DATABASE_URL 未设置` | 缺 `.env` | `cp .env.example .env` |
| 重复邮箱注册返回 500 + 长堆栈 | 没捕获 `P2002` | 抛 `ConflictException`，见 6.2 |
| `P2002` 的 `meta` 里找不到 `target` | Prisma 7 + driver adapter 结构变了 | 读 `meta.driverAdapterError.cause` |
| 查不到记录返回 500 | 没捕获 `P2025` | 抛 `NotFoundException` |
| `/user/:id` 传 `abc` 报奇怪的参数错误 | `Number('abc')` 得到 `NaN` | 进库前先校验并抛 `BadRequestException` |
| 测试跑了几分钟 | 测试文件把 `src/generated` 拖进来了 | 别 import 生成代码 |
| e2e 连了真实数据库 | 没 override PrismaService | `useValue(mock)`，见第 7 节 |
| 改了 `schema.prisma` 但类型没变 | 没重新 generate | `npx prisma generate` |

## 11. 提交前自检清单

- [ ] `npx tsc --noEmit -p tsconfig.json` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过
- [ ] 新接口有 spec；返回结构变化已同步测试
- [ ] 没有把 `.env` / `src/generated` / `dist` 加入提交
- [ ] 改了 `prisma/schema.prisma` 就有对应的 migration 文件
- [ ] 没有留下调试用 `console.log`

## 12. 已知技术债（**不是**规范，别照抄）

- `test/app.e2e-spec.ts` 还指着旧路由 `/user/user`，且断言 `total: 100`，当前跑必失败；`test/jest-e2e.json` 是 Jest 时代遗留文件。
- user 的列表 / 详情接口目前仍把 `password` 返回给前端（controller 里原有的脱敏代码已被移除）。
- `article` / `models` / `prompts` 的响应结构尚未统一为第 6.1 节的形状。
- `models.controller.ts` 用内联匿名对象当 Body 类型（`@Body() body: { message: string }`），没走 DTO。
- 未启用全局 `ValidationPipe`，DTO 上的字段校验目前只在「入参钳制」和「数据库约束」层面兜底。
- `eslint.config.mjs` 与 `oxlint.json` 两套 lint 并存，但 `pnpm lint` 实际只跑 oxlint；且前者 `sourceType` 仍是 `commonjs`，与项目的 ESM 不一致。
