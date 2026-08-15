# backup_daily.ps1 —— 词跃 LexiRise 每日自动备份（Windows 任务计划调用）
# 功能：1) 生成数据库快照  2) 复制到归档目录（可指向网盘同步文件夹） 3) 只保留最近 7 份
# 手动测试:  powershell -ExecutionPolicy Bypass -File E:\初二\web\scripts\backup_daily.ps1
$ErrorActionPreference = 'Stop'
$web     = 'E:\初二\web'
$archive = 'E:\初二\数据备份\lexirise'   # 归档目录：改成你的网盘同步文件夹更保险

# 1) 生成快照（VACUUM INTO，服务在线也安全）
Push-Location $web
node scripts/backup_db.mjs
Pop-Location

# 2) 复制最新备份到归档目录
New-Item -ItemType Directory -Force -Path $archive | Out-Null
$latest = Get-ChildItem "$web\data\backups\*.db" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) {
    Copy-Item $latest.FullName "$archive\$($latest.Name)" -Force
    Write-Output "归档: $archive\$($latest.Name)"
}

# 3) 两边都只保留最近 7 份
foreach ($dir in @("$web\data\backups", $archive)) {
    Get-ChildItem "$dir\*.db" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -Skip 7 | Remove-Item -Force -ErrorAction SilentlyContinue
}
Write-Output "✅ 每日备份完成"
