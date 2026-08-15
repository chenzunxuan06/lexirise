#!/usr/bin/env bash
# deploy-linux.sh —— 词跃 LexiRise Linux 一键部署（VPS / CloudStudio 工作空间）
# 用法：把 web/ 目录传到服务器后，在 web/ 目录执行:
#   bash scripts/deploy-linux.sh
set -e
cd "$(dirname "$0")/.."

echo "== 0/4 检查 Node 版本 (需要 >=22.5) =="
node -v || { echo "请先安装 Node.js >=22.5（如: nvm install 22 && nvm use 22）"; exit 1; }
V=$(node -p "process.versions.node.split('.')[0]")
if [ "$V" -lt 22 ]; then
  echo "❌ 当前 Node 版本过低（node:sqlite 需要 >=22.5）。请升级: nvm install 22 && nvm use 22"
  exit 1
fi

echo "== 1/4 安装依赖 =="
npm ci --omit=dev || npm install

echo "== 2/4 构建 =="
npm run build

echo "== 3/4 启动 (PM2 守护) =="
command -v pm2 >/dev/null || npm i -g pm2
pm2 start ecosystem.config.cjs || pm2 restart ecosystem.config.cjs
pm2 save

echo "== 4/4 完成 =="
echo "本机验证: curl http://localhost:3000"
echo "公网访问:"
echo "  方案A Nginx 反代: server { listen 80; server_name 你的域名;"
echo "                     location / { proxy_pass http://127.0.0.1:3000;"
echo "                     proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$remote_addr; } }"
echo "  方案B 直接映射端口 3000（CloudStudio/VPS 安全组放行）"
echo "别忘了配置每日备份（服务器 cron 定时执行 scripts/backup_db.mjs）"
