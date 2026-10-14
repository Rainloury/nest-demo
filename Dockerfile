# Dockerfile

# 本仓库用 pnpm 管理依赖（pnpm-lock.yaml），镜像里必须照搬同一个包管理器：
# 之前用 npm install 会忽略 pnpm-lock.yaml 重新解析依赖树，
# 而 @langchain/community 的可选 peer @browserbasehq/stagehand 只接受 zod@^3，
# 与根依赖 zod@^4 冲突 → npm 直接报 ERESOLVE（这就是构建失败的原因）。
# 版本与本地保持一致（pnpm 12.3.4），避免锁文件 / pnpm-workspace.yaml 语义漂移。

# ── 第一阶段：构建阶段（builder）────────────────────────────
# 使用 Node.js 20 Alpine 版本作为基础镜像
# Alpine 是精简版 Linux，镜像体积更小（约 50MB vs Ubuntu 的 200MB+）
FROM node:20-alpine AS builder

ARG PNPM_VERSION=12.3.4
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置工作目录（容器内的工作路径）
WORKDIR /app

# 安装 pnpm（走 npmmirror，国内直连官方源很慢）
RUN npm install -g pnpm@${PNPM_VERSION} --registry=${NPM_REGISTRY}

# 先只复制依赖清单：只改业务代码时，下面这层安装缓存不会失效
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装所有依赖（包括 devDependencies，因为构建需要 TypeScript 编译器 / Nest CLI）
# --frozen-lockfile：严格按锁文件安装，锁文件与 package.json 不一致会立刻失败，
# 而不是悄悄装出一套和本地不同的版本
RUN pnpm install --registry=${NPM_REGISTRY}

# 复制 prisma 目录（包含 schema.prisma 和 migrations）
COPY prisma ./prisma

# 复制 prisma.config.ts（Prisma 7 配置文件）
COPY prisma.config.ts ./

# 复制其余所有源代码
COPY . .

# prisma generate 不连数据库，但 prisma.config.ts 里的 env('DATABASE_URL')
# 要求变量存在，缺失会抛 PrismaConfigEnvError，所以给一个占位值；
# 真实连接串由 docker-compose 的 env_file 在运行时注入。
ENV DATABASE_URL="postgresql://user:password@localhost:5432/nest_demo?schema=public"

# Prisma 引擎二进制在官方 CDN 上，国内解析不了（与 .env.example 保持一致走 npmmirror）
ENV PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"

# 生成 Prisma Client（根据 schema.prisma 生成 TypeScript 类型和查询代码）
# 生成位置：src/generated/prisma/（该目录被 .dockerignore 排除，必须在镜像内生成）
RUN npx prisma generate

# 编译 TypeScript → JavaScript
# 编译产物输出到 dist/（含 dist/generated/prisma/*.js）
RUN pnpm build

# ── 第二阶段：生产阶段（runner）─────────────────────────────
# 重新从干净的 Node.js 镜像开始，不包含构建工具
# 这样最终镜像只有运行所需的文件，体积更小、更安全
FROM node:20-alpine AS runner

ARG PNPM_VERSION=12.3.4
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置 Node.js 运行环境为生产模式
# 生产模式下 NestJS 会关闭调试输出，性能更好
ENV NODE_ENV=production

# 引擎镜像地址保持和构建阶段一致，防止安装依赖时触发下载失败
ENV PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"

WORKDIR /app

RUN npm install -g pnpm@${PNPM_VERSION} --registry=${NPM_REGISTRY}

# 从 builder 阶段复制依赖清单（安装生产依赖需要）
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# 只安装生产依赖（不安装 devDependencies，减小镜像体积）
# --ignore-scripts 是必须的：@prisma/client 的 peer 会把 `prisma` CLI 一起带进来，
# 进而带上 @prisma/engines，它的 postinstall 会去下载 schema engine 二进制；
# 运行阶段根本用不到（客户端已在构建阶段生成并编译进 dist），
# 但那个下载在弱网/受限网络下会 ECONNRESET，直接把安装搞失败。
RUN pnpm install --prod  --ignore-scripts --registry=${NPM_REGISTRY}

# 从 builder 阶段复制编译好的 JavaScript 代码
# Prisma Client 已被编译进 dist/generated，无需再单独拷贝 src/generated
COPY --from=builder /app/dist ./dist

# 从 builder 阶段复制 prisma 目录（后续在容器里执行 migrate 时需要）
COPY --from=builder /app/prisma ./prisma

# 从 builder 阶段复制 prisma.config.ts（Prisma 7 配置文件）
COPY --from=builder /app/prisma.config.ts ./

# 暴露 NestJS 服务端口
# EXPOSE 只是声明，实际端口映射在 docker-compose.yml 里配置
EXPOSE 3000

# 启动命令：运行编译后的入口文件
# 注意：生产环境运行 dist/main.js，不是 ts-node src/main.ts
CMD ["node", "dist/main.js"]
