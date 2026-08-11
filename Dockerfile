FROM node:20-alpine AS builder
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# NEXT_PUBLIC_* 必须在 build 时注入（会被内联进客户端 bundle）
ENV NEXT_PUBLIC_BASE_PATH=/hotwriter
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

EXPOSE 3000
CMD ["npm", "start"]
