#!/usr/bin/env bash
# deploy-linux.sh —— 词跃 LexiRise Linux 一键部署（VPS / CloudStudio 工作空间）
# 用法：把 web/ 目录传到服务器后，在 web/ 目录执行:
#   bash scripts/deploy-linux.sh
set -e
cd "$(dirname "$0")/.."

echo "== 0/4 检查 Node 版本 (需要 >=18) =="
node -v || { echo "请先安装 Node.js >=18"; exit 1; }
V=$(node -p "process.versions.node.split('.')[0]")
if [ "$V" -lt 18 ]; then
  echo "❌ 当前 Node 版本过低（需要 >=18）。请升级: nvm install 20 && nvm use 20"
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
if [ -n "$X_IDE_SPACE_KEY" ]; then
  echo "🎉 CloudStudio 公网访问地址（复制到浏览器打开）:"
  echo "https://${X_IDE_SPACE_KEY}--3000.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}"
else
  echo "公网访问: 用 Nginx 反代或云服务器安全组放行 3000 端口"
fi
echo "别忘了配置每日备份（服务器 cron 定时执行 scripts/backup_db.mjs）"
