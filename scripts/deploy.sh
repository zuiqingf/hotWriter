#!/usr/bin/env bash
# hotWriter 一键部署脚本（本地 → 47.111.1.180）
#
# 流程：
#   1. 本地检查必填 env 变量（HOTWRITER_DEEPSEEK_KEY / HOTWRITER_DB_PASSWORD）
#   2. URL-encode 数据库密码
#   3. 本地打包源码（排除 node_modules / .next / 本地 env / 临时文件）
#   4. 本地构造 .env（含密码）→ 与源码一起 scp 到 180:/root/hotwriter/
#   5. 远程清理 + 解压
#   6. 停旧容器、把旧 image 标记为 hotwriter:rollback
#   7. docker build + docker run（端口 3010、--network host、挂载 uploads）
#   8. 看启动日志
#
# 用法：
#   export HOTWRITER_DEEPSEEK_KEY=sk-xxxxxxxxxx
#   export HOTWRITER_DB_PASSWORD='<mysql root password>'  # 明文，脚本会自动 URL-encode
#   bash scripts/deploy.sh
#   # 可选：export HOTWRITER_TAVILY_KEY=tvly-xxxxx
#
# 前提：
#   - SSH key 在 ~/.ssh/id_gyd，已加入 180 的 authorized_keys
#   - 180 上 Docker 已装、MySQL db_hotwriter 库已建（schema 由应用首次启动时建）

set -euo pipefail

REMOTE_HOST=root@47.111.1.180
SSH_KEY=~/.ssh/id_gyd
REMOTE_DIR=/root/hotwriter
PORT=3010
TMP_TARBALL=/tmp/hotwriter-src.tar.gz
TMP_ENV=/tmp/hotwriter-deploy.env

# ===== 必填环境变量检查（这些值不入 git）=====
if [ -z "${HOTWRITER_DEEPSEEK_KEY:-}" ]; then
  echo "ERROR: 请先 export HOTWRITER_DEEPSEEK_KEY=<deepseek api key>" >&2
  exit 1
fi
if [ -z "${HOTWRITER_DB_PASSWORD:-}" ]; then
  echo "ERROR: 请先 export HOTWRITER_DB_PASSWORD=<mysql root password>" >&2
  echo "       (明文即可，脚本会自动 URL-encode)" >&2
  exit 1
fi

# URL-encode 密码（处理 URL 保留字符；百分号必须最先转，避免二次编码）
DB_PASSWORD_ENCODED=$(printf '%s' "$HOTWRITER_DB_PASSWORD" \
  | sed -e 's/%/%25/g' \
        -e 's/#/%23/g' \
        -e 's/@/%40/g' \
        -e 's|/|%2F|g' \
        -e 's/:/%3A/g' \
        -e 's/?/%3F/g' \
        -e 's/&/%26/g' \
        -e 's/+/%2B/g' \
        -e 's/=/%3D/g' \
        -e 's/ /%20/g')

echo "[1/7] 本地打包源码..."
cd "$(dirname "$0")/.."

tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.production' \
    --exclude='*.log' \
    --exclude='test-migration*' \
    --exclude='.inspect-180.sh' \
    --exclude='.redirect-debug.sh' \
    --exclude='.nginx-fix.sh' \
    --exclude='.nginx-noslash-fix.sh' \
    --exclude='.verify-fix.sh' \
    --exclude='.commit-msg.txt' \
    --exclude='.git-commit-msg.txt' \
    --exclude='scripts/deploy.sh' \
    --exclude='.claude' \
    -czf "$TMP_TARBALL" .

echo "[2/7] 构造运行时 .env（含密码，从本地变量注入）..."
cat > "$TMP_ENV" <<EOF
DEEPSEEK_API_KEY=${HOTWRITER_DEEPSEEK_KEY}
TAVILY_API_KEY=${HOTWRITER_TAVILY_KEY:-}
DATABASE_URL=mysql://root:${DB_PASSWORD_ENCODED}@127.0.0.1:3306/db_hotwriter?charset=utf8mb4
NEXT_PUBLIC_BASE_PATH=/hotwriter
NODE_ENV=production
EOF

echo "[3/7] 上传到 ${REMOTE_HOST}:${REMOTE_DIR}/ ..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$TMP_TARBALL" "${REMOTE_HOST}:${REMOTE_DIR}/hotwriter-src.tar.gz"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$TMP_ENV" "${REMOTE_HOST}:${REMOTE_DIR}/.env"
rm -f "$TMP_ENV"

echo "[4/7] 远程清理 + 解压 + 构建 + 启动..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" << "REMOTE"
set -euo pipefail
PORT=3010
cd /root/hotwriter

# 清理旧源码（保留目录壳；uploads/ 和 data/ 保留；.env 刚 scp 上来了）
rm -rf src public package.json package-lock.json next.config.js Dockerfile .dockerignore drizzle.config.ts 2>/dev/null || true

# 备份旧 SQLite 文件（万一回滚）
if [ -f data/hotwriter.db ]; then
  mv data/hotwriter.db data/hotwriter.db.sqlite-backup-$(date +%Y%m%d%H%M%S) 2>/dev/null || true
fi

tar xzf hotwriter-src.tar.gz
rm hotwriter-src.tar.gz

echo "  → 停旧容器（若有）+ 旧 image 标记为 rollback"
docker rm -f hotwriter 2>/dev/null || true
if docker image inspect hotwriter:latest >/dev/null 2>&1; then
  docker rmi hotwriter:rollback 2>/dev/null || true
  docker tag hotwriter:latest hotwriter:rollback
  docker rmi hotwriter:latest
fi

echo "  → docker build..."
docker build -t hotwriter:latest .

echo "  → docker run（端口 $PORT、--network host）..."
docker run -d --name hotwriter \
  --restart unless-stopped \
  --network host \
  -e PORT=$PORT \
  --env-file /root/hotwriter/.env \
  -v /root/hotwriter/uploads:/app/public/uploads \
  hotwriter:latest

echo "  → 等待启动..."
sleep 8

echo "  → 容器日志（最近 40 行）："
docker logs hotwriter --tail 40 2>&1 || true
REMOTE

echo "[5/7] 清理本地临时文件..."
rm -f "$TMP_TARBALL"

echo "[6/7] 验证容器内 API..."
ssh -i "$SSH_KEY" "$REMOTE_HOST" "curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3010/hotwriter/api/articles"

echo "[7/7] 完成。容器状态："
ssh -i "$SSH_KEY" "$REMOTE_HOST" "docker ps --filter name=hotwriter --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'"
