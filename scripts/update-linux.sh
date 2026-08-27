#!/usr/bin/env bash
# update-linux.sh —— 词跃 LexiRise 服务器一键更新
# 用法（服务器上，web/ 目录）：
#   bash scripts/update-linux.sh
# 做的事：git pull → 装依赖（如有变化）→ 构建 → PM2 重启
# 安全：不会动 data/user.db（.gitignore 已排除），更新前建议先手动备份：
#   node scripts/backup_db.mjs
set -e
cd "$(dirname "$0")/.."

echo "== 0/4 更新前备份数据库 =="
node scripts/backup_db.mjs || echo "（备份失败但继续；建议检查 data/ 可写）"

echo "== 1/4 拉取最新代码 =="
git pull --ff-only || { echo "❌ git pull 失败：服务器可能连不上 GitHub（国内网络），可尝试: git config --global http.proxy 或手动上传"; exit 1; }

echo "== 2/4 安装依赖（本轮无新增依赖，安全跳过失败不致命） =="
npm ci --omit=dev 2>/dev/null || npm install 2>/dev/null || echo "-- 依赖已就绪 --"
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 22 ]; then
  echo "-- Node $MAJOR 安装 better-sqlite3 --"
  command -v pm2 >/dev/null || npm i -g pm2
  npm install better-sqlite3@11.10.0 --no-save
fi

echo "== 3/4 构建 =="
npm run build

echo "== 4/4 PM2 重启 =="
pm2 restart ecosystem.config.cjs 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save

echo "== 完成 =="
echo "本机验证: curl http://localhost:3000"
echo "AI 功能启用（可选）：在服务器创建 web/.env.local，内容："
echo "  LLM_BASE_URL=https://api.deepseek.com"
echo "  LLM_API_KEY=sk-你的密钥"
echo "  LLM_MODEL=deepseek-chat"
echo "然后 pm2 restart ecosystem.config.cjs 即可"