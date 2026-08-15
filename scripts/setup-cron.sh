#!/usr/bin/env bash
# setup-cron.sh —— 一键配置每日自动备份（CloudStudio / VPS 通用）
# 用法: bash scripts/setup-cron.sh
# 效果: 每天 03:00 执行 backup_db.mjs，保留最近 7 份
set -e
cd "$(dirname "$0")/.."
DIR="$(pwd)"

LINE="0 3 * * * cd $DIR && node scripts/backup_db.mjs >> data/backups/cron.log 2>&1 && find data/backups -name '*.db' -mtime +7 -delete"

# 先删掉旧的备份任务再追加，避免重复
( crontab -l 2>/dev/null | grep -v "scripts/backup_db.mjs" ; echo "$LINE" ) | crontab -

echo "✅ 已配置每日 03:00 自动备份（项目目录: $DIR）"
crontab -l | grep backup_db.mjs

# 检查 cron 守护进程是否在跑（不在则尝试启动）
if ! pgrep -x cron >/dev/null 2>&1 && ! pgrep -x crond >/dev/null 2>&1; then
  ( service cron start || service crond start ) 2>/dev/null && echo "cron 服务已启动" \
    || echo "⚠️ 警告: cron 服务未运行，备份不会自动执行。请手动运行备份: node scripts/backup_db.mjs"
fi
echo "提示: 手动备份 node scripts/backup_db.mjs | 查看备份 ls data/backups/"
