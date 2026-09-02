# Dockerfile

# ── 第一阶段：构建阶段（builder）────────────────────────────
# 使用 Node.js 20 Alpine 版本作为基础镜像
# Alpine 是精简版 Linux，镜像体积更小（约 50MB vs Ubuntu 的 200MB+）
FROM node:20-alpine AS builder

# 设置工作目录（容器内的工作路径）
WORKDIR /app

# 先单独复制 package.json 和 package-lock.json
# 好处：如果只改了业务代码，npm install 这层缓存不会失效，加快构建速度
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，因为构建需要 TypeScript 编译器）
RUN npm install

# 复制 prisma 目录（包含 schema.prisma 和 migrations）
COPY prisma ./prisma

# 复制 prisma.config.ts
COPY prisma.config.ts ./

# 复制其余所有源代码
COPY . .

# 生成 Prisma Client（根据 schema.prisma 生成 TypeScript 类型和查询代码）
# 生成位置：src/generated/prisma/
RUN npx prisma generate

# 编译 TypeScript → JavaScript
# 编译产物输出到 dist/ 目录
RUN npm run build

# ── 第二阶段：生产阶段（runner）─────────────────────────────
# 重新从干净的 Node.js 镜像开始，不包含构建工具
# 这样最终镜像只有运行所需的文件，体积更小、更安全
FROM node:20-alpine AS runner

# 设置 Node.js 运行环境为生产模式
# 生产模式下 NestJS 会关闭调试输出，性能更好
ENV NODE_ENV=production

WORKDIR /app

# 从 builder 阶段复制 package.json（安装生产依赖需要）
COPY --from=builder /app/package*.json ./

# 只安装生产依赖（不安装 devDependencies，减小镜像体积）
RUN npm install --only=production

# 从 builder 阶段复制编译好的 JavaScript 代码
COPY --from=builder /app/dist ./dist

# 从 builder 阶段复制 Prisma 生成的 Client 代码
COPY --from=builder /app/src/generated ./src/generated

# 从 builder 阶段复制 prisma 目录（迁移时需要）
COPY --from=builder /app/prisma ./prisma

# 从 builder 阶段复制 prisma.config.ts（Prisma 7 配置文件）
COPY --from=builder /app/prisma.config.ts ./

# 暴露 NestJS 服务端口
# EXPOSE 只是声明，实际端口映射在 docker-compose.yml 里配置
EXPOSE 3000

# 启动命令：运行编译后的入口文件
# 注意：生产环境运行 dist/main.js，不是 ts-node src/main.ts
CMD ["node", "dist/main.js"]