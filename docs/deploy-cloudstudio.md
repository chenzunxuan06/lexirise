# 部署指南 A · CloudStudio（国内免费）

> CloudStudio 是腾讯云旗下的在线开发空间（就是你上一个网站用的平台）。
> 免费工作空间可能**休眠**（长时间无访问会停），需要"保活"——本文第 5 步给方案。

## 0. 前置
- 你已注册腾讯云账号（console.cloud.tencent.com 登录）
- 代码已推到 GitHub（见 `deploy-github-push.md` 或仓库根 README）

## 1. 开通 Cloud Studio
- 方式一：腾讯云控制台顶部搜索「Cloud Studio」→ 进入产品页 → 用同一账号登录
- 方式二：直接访问 cloudstudio.net → 用腾讯云/微信登录
- 首次进入选一个**免费工作空间**模板：开发环境选 **Node.js**（如只有 **ws node18** 也没问题，本项目 Node ≥ 18 即可）
  - 依赖 better-sqlite3 自带预编译二进制，Node 18 无需任何额外配置
  - 其它模板（Python/Java 等）与本项目无关，不用管

## 2. 从 GitHub 导入仓库
- 在 Cloud Studio 工作空间列表 →「新建工作空间」→ 来源选 **GitHub 仓库** → 选 `chenzunxuan06/lexirise`
- 或在工作空间终端里直接克隆：
  ```bash
  git clone https://github.com/chenzunxuan06/lexirise.git && cd lexirise
  ```

## 3. 一键部署
在空间终端执行（项目根目录，即含 package.json 的目录）：
```bash
bash scripts/deploy-linux.sh
```
脚本会：装依赖 → 构建 → PM2 启动（端口 3000）。

## 4. 公网访问（CloudStudio 没有"端口按钮"，地址用环境变量拼）
在 CloudStudio 网页终端里执行（服务需已启动且监听 0.0.0.0——Next.js 默认就是）：
```bash
# 确认服务在跑
curl -s localhost:3000 | head -c 100

# 拼出公网地址（复制输出到浏览器打开）
echo "https://${X_IDE_SPACE_KEY}--3000.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}"
```
- 地址形如 `https://xxxx--3000.ap-shanghai2.cloudstudio.club`（官方文档：cloudstudio.net/docs 搜索"URL 访问异常排查"）
- 部署脚本 `deploy-linux.sh` 跑完也会自动打印这个地址
- ⚠️ 如果打不开：确认服务监听 `0.0.0.0`（Next 默认满足）、端口必须 3000 一致、工作空间未休眠
- 网页版 IDE 的终端面板附近若看到 🔌/端口 图标，也能查看端口；但公网地址以上面拼出的为准

## 4.5 保活（免费空间休眠问题）
空间休眠后访问会慢/需要重新唤醒。方案：
- **定时唤醒**：用任意免费定时服务（如 UptimeRobot、cron-job.org）每 5~10 分钟 GET 一次你的公网地址 —— 同时还能监控网站存活
- 或 Cloud Studio 付费版/升级空间免除（看你自己预算）

## 4.6 AI 功能启用（可选）
网站含 AI 模块（单词讲解/错题解析/每日练习/单元复习包）。**不设置也能正常使用**，AI 按钮会显示"未配置"。
启用：在 CloudStudio 终端执行（PM2 会继承这些环境变量）：
```bash
export LLM_API_KEY=sk-你的DeepSeek密钥
export LLM_BASE_URL=https://api.deepseek.com   # 可选，默认就是
export LLM_MODEL=deepseek-chat                 # 可选，默认就是
pm2 restart lexirise
```
- 密钥在 platform.deepseek.com 创建（充值极少量即可）
- 换用其他 OpenAI 兼容服务商：改上面三个变量即可，零改代码
- 用量：讲解有 30 天全站缓存，练习每用户每天 1 次，费用可忽略

## 6. 常见问题
| 问题 | 解决 |
| --- | --- |
| 端口被占用 | `pm2 kill` 后重新 `pm2 start ecosystem.config.cjs` |
| 公网打不开 | 确认 3000 端口公网访问已开启；`curl localhost:3000` 先本地验证 |
| 数据丢了？ | 工作空间重置会丢数据 —— **务必定时备份**（第 4 步） |
| 升级/迁移 | 备份 user.db → 新空间放回 `data/user.db` → 重启 |
