# 部署指南 · 国内轻量云服务器（推荐，稳定）

> CloudStudio 免费空间会休眠、终端不稳，长期运营建议用**轻量云服务器**：永不停机、有图形化管理面板（宝塔）、还能绑自己的域名。
> 本文以**腾讯云轻量应用服务器 + 宝塔面板**为例（你已有腾讯云账号）；阿里云同理。

## 第 0 步 · 买服务器（约 5 分钟）

1. 打开 https://cloud.tencent.com/product/lighthouse （轻量应用服务器）
2. 选套餐：**2核2G 或 2核4G**（网站 + 几个用户足够），带宽 3~5M 即可
   - 新用户常有首年 ¥50~100 特价；续费会贵一些，介意的话可以每年换新号/等活动
3. 地域选离你近的（如广州/上海/北京）
4. **操作系统选「Ubuntu 22.04」**（Node 环境好装，宝塔兼容好）
5. 设置 root 密码（记住它），购买

## 第 1 步 · 装宝塔面板（图形化，约 5 分钟）

1. 腾讯云控制台 → 轻量应用服务器 → 你的服务器 → 点「登录」（网页版终端，SSH 很稳，不会像 CloudStudio 那样断）
2. 在终端里执行（Ubuntu）：
   ```bash
   wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && bash install.sh
   ```
3. 装完会打印一个面板地址 + 账号密码（形如 `http://<服务器IP>:8888/xxxxx`），**保存好**
4. 浏览器打开面板地址 → 登录 → 按提示装「LNMP」环境（选 Nginx + 不装数据库/php 也行，我们用 Node）

## 第 2 步 · 装 Node 18+（宝塔软件商店）

1. 宝塔左侧「软件商店」→ 搜 **Node.js 版本管理器** → 安装
2. 打开 Node 管理器 → 安装版本选 **20.x**（或 22.x）→ 安装
3. 确认终端里 `node -v` 显示 v20 开头

## 第 3 步 · 拉代码并部署（约 5 分钟）

宝塔左侧「网站」→「Node 项目」→「添加 Node 项目」：
- **项目目录**：`/www/wwwroot/lexirise`
- 或者更简单，直接在服务器终端里（宝塔也有「终端」）：
  ```bash
  cd /www/wwwroot
  git clone https://github.com/chenzunxuan06/lexirise.git lexirise
  cd lexirise
  bash scripts/deploy-linux.sh
  ```
- 部署脚本会自动：装依赖 → 构建 → PM2 启动（端口 3000）

## 第 4 步 · 配置域名/反代（可选，推荐）

1. 买一个域名（阿里/腾讯云，约 ¥10~50/年，如 `lexirise.cn`）并解析到服务器 IP
2. 宝塔「网站」→「添加站点」→ 填域名 → 反向代理指向 `http://127.0.0.1:3000`
3. 宝塔「SSL」→ 申请免费证书（Let's Encrypt）→ 开启 HTTPS
   - 不做域名也可以：直接访问 `http://服务器IP:3000`（但要先放行安全组端口）

## 第 5 步 · 放行端口

腾讯云控制台 → 服务器 → 「防火墙」→ 添加规则：放行 **3000**（和 80/443 若用域名）

## 第 6 步 · 每日自动备份

宝塔「计划任务」→ 添加 Shell 任务：
```
cd /www/wwwroot/lexirise && node scripts/backup_db.mjs && find data/backups -name '*.db' -mtime +7 -delete
```
每天 03:00 执行 → 备份在 `data/backups/`；再把该目录同步到宝塔「备份」或网盘

## 第 7 步 · 数据迁移（把 CloudStudio 的数据搬过来）

1. 旧站（CloudStudio 管理后台）→「下载数据库备份」得到 user.db
2. 新服务器：`/www/wwwroot/lexirise/data/user.db`（停止服务后覆盖，再 `pm2 restart lexirise`）
   - 不想迁移就跳过：新服务器从零开始，重新注册账号 + 成为管理员即可

## 常见问题

| 问题 | 解决 |
| --- | --- |
| 打不开 | 安全组/防火墙放行 3000 或 80/443；`pm2 list` 看状态 |
| 想换域名 | 宝塔站点绑定新域名 + 解析 |
| 服务器重启 | PM2 已开机自启（宝塔或 `pm2 startup`），无需手动 |
| 内存小 | 2G 足够本项目；不够再加 swap（宝塔有工具） |
