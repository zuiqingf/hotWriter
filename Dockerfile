FROM node:20-alpine AS builder
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# NEXT_PUBLIC_* 必须在 build 时注入（会被内联进客户端 bundle）
# BASE_PATH 在 server 启动时被 next.config.js 读取，build/runtime 都需要
ENV NEXT_PUBLIC_BASE_PATH=/hotwriter
ENV BASE_PATH=/hotwriter
RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY next.config.js ./
COPY public public
COPY --from=builder /app/.next .next

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# 与 builder 阶段保持一致（next.config.js 在 server 启动时读取 BASE_PATH）
ENV BASE_PATH=/hotwriter

EXPOSE 3000
CMD ["npm", "start"]
