# 词跃 LexiRise · 初中英语背单词网站

面向初中生的单词学习网站，数据为**沪教牛津版初中英语 7~9 年级 1535 词**（官方教材词表）。

围绕单词的完整学习闭环：**背书（按学期/单元）· 训练（选择/闪卡/听写/听力）· 单元测验（限时）· 短语专项 · 词根词缀提示 · 记忆曲线复习 · 错题本 · 生词本 · 我的词表（导入自建）· 考试历史 · 每日目标 · 学习统计 · 每日一词**。

支持**账号体系**：注册/登录后，背词进度、错题本、收藏、考试记录、我的词表全部**云端保存**，换设备登录同一账号即可同步。

## 功能一览

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 登录/注册 | `/login` | 用户名+密码（bcrypt 加密，httpOnly 会话） |
| 首页 | `/` | 每日一词、每日目标进度环、打卡天数、待复习/新词/错题/生词统计、快捷入口 |
| 背书 | `/recite` | 按 年级→学期→单元 逐词背诵（教材原序、自动朗读、释义/例句、认识/不认识记入记忆曲线） |
| 训练 | `/train` | 5 种模式；词源可选「教材词库/我的词表」；范围可过滤「全部/单词/短语」；💡 词根词缀提示 |
| 测验 | `/exam` | 单元测验：限时、100 分制成绩单、错题报告与重测，成绩自动入历史 |
| 复习 | `/review` | 记忆曲线到期复习（可按 新词/学习中/已掌握 筛选）、错题本、生词本 |
| 词库 | `/vocab` | **单元导航**（年级→册→单元，不再一次渲染全部）、搜索全库、详情含词根词缀/例句/收藏 |
| 短语 | `/phrases` | 399 条教材固定搭配专项，按单元浏览、整句朗读、一键训练 |
| 我的词表 | `/mywords` | 导入（粘贴/文件）、导出、管理；可进训练与记忆曲线（需登录） |
| 词根词缀 | `/affixes` | 57 前缀 + 44 后缀 + 290 词根速查库 |
| 统计 | `/stats` | 考试成绩趋势、记忆状态分布、8 周打卡热力图、近 7 天学习量 |

## 技术栈

- **Next.js 14**（App Router）+ React 18，**服务端模式**（API 路由）
- 词库数据：`public/words.json` + `public/affixes.json` 静态 JSON
- **账号数据库：Node 内置 SQLite**（`node:sqlite`，零依赖），文件 `data/user.db`
- 密码加密：Node `crypto.scrypt`；会话：随机 token + httpOnly Cookie（30 天）
- 发音：浏览器 Web Speech API；学习记录：localStorage 本地缓存 + 自动同步服务器

> ⚠️ 需要 **Node.js ≥ 22.5**（`node:sqlite` 要求；Node 23.4+ 无需实验标志）

## 本地运行

```bash
cd web
npm install
npm run dev        # 开发模式 http://localhost:3000
# 或生产模式
npm run build
npm run start
```

首次启动自动创建 `web/data/user.db`（注册/登录后生效）。

## 部署上线

### 方式一：自购轻量云服务器（推荐，国内访问快、数据自主）
阿里云/腾讯云轻量 2C2G（约 ¥60~100/年）或 **CloudStudio 免费空间**：
1. 装 Node.js ≥ 22.5
2. 上传项目（`web/` 目录），`npm install && npm run build`
3. **PM2 守护**：`npm i -g pm2 && pm2 start "npm run start" --name lexirise`
4. Nginx 反代 80 端口 + HTTPS 证书（宝塔面板一键）
5. 数据库备份：每天 `cp web/data/user.db web/data/user.db.$(date +%F)`，保留 7 份（cron 或宝塔计划任务）

### 方式二：Vercel / 国内 Serverless
- 构建本身兼容 Vercel，但 **Vercel 函数无持久磁盘，SQLite 文件不跨请求保留**
- 若要上 Vercel，需把数据层换成托管数据库（如 Supabase/Turso），改动集中在 `lib/db.js` 与 API 路由
- CloudStudio 提供持久工作空间，可以直接跑 Node 服务

## 数据与备份

- 词库（只读）：`public/words.json`（1535 词，含词根词缀/例句/音标）
- 账号数据（读写）：`data/user.db`（users / sessions / user_data / custom_words）
- 学习记录每 2 秒防抖自动同步到账号；离线可学，联网自动补推
- 数据流水线脚本见 `../scripts/`（词根词缀生成、例句抓取翻译等）

## 项目结构

```
web/
├─ app/
│  ├─ page.jsx / login / recite / train / exam / review
│  ├─ vocab / phrases / mywords / affixes / stats
│  ├─ api/           账号与同步 API（auth / sync / words）
│  ├─ components/    Sidebar、ExampleBlock
│  └─ globals.css
├─ lib/
│  ├─ db.js          SQLite 懒加载单例（建表）
│  ├─ auth.js        scrypt 密码 + 会话
│  ├─ sync.js        登录态 + 学习数据同步层
│  ├─ memory.js      本地学习记录（变更自动通知同步）
│  ├─ loadWords.js / tts.js
├─ data/user.db      账号数据库（运行时生成）
└─ public/words.json, affixes.json
```
