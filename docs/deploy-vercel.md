# 部署指南 B · GitHub + Vercel（国外）

> Vercel 跑 Next.js 最方便，但**函数没有持久磁盘**，所以数据库用 **Turso**（SQLite 兼容托管库，免费档够用）。
> 代码已做好双后端：设置 `TURSO_URL` + `TURSO_AUTH_TOKEN` 环境变量即自动切到 Turso，不设置则用本地 SQLite（本地/CloudStudio 不受影响）。

## 第 1 步 · 推代码到 GitHub
1. 打开 https://github.com/new → 仓库名填 `lexirise` → Public/Private 都行 → 创建（**不要**勾选 README/.gitignore 初始化）
2. 在本机 `web/` 目录执行（仓库已初始化并提交过）：
   ```bash
   git remote add origin https://github.com/chenzunxuan06/lexirise.git
   git branch -M main
   git push -u origin main
   ```
   （会要求登录 GitHub：用浏览器弹出的窗口授权即可）
3. 也可以直接用 **GitHub Desktop**：File → Add Local Repository → 选 `E:\初二\web` → Publish。

## 第 2 步 · 建 Turso 数据库（免费）
1. 打开 https://turso.tech → 用 GitHub 登录 → 免费计划
2. Create database → 名字填 `lexirise` → 区域选离你近的（如 `aps-northeast-1` 东京）
3. 在数据库页面拿到两样东西：
   - **URL**（形如 `libsql://lexirise-xxxx.turso.io`）
   - **Token**：点 Generate Token（注意：token 只在生成时显示一次，先复制保存）
   > ⚠️ 这两项是"钥匙"，**只填到 Vercel 环境变量里，不要发到群里/聊天里**。

## 第 3 步 · 导入 Vercel
1. 打开 https://vercel.com → 用 GitHub 登录 → **Add New Project** → Import `chenzunxuan06/lexirise`
2. 框架自动识别 Next.js；构建命令 `npm run build`，无需改
3. **Environment Variables** 添加两个：
   - `TURSO_URL` = 第 2 步的 URL
   - `TURSO_AUTH_TOKEN` = 第 2 步的 Token
4. Deploy。完成后得到 `https://lexirise.vercel.app`（可自定义域名）

## 第 4 步 · 验证
1. 打开线上地址 → 注册一个账号 → 背几个词 → 刷新/换设备登录，进度还在 = 数据库 OK
2. 若登录后进度不保存：检查 Vercel 项目 → Settings → Environment Variables 是否配好，重新 Deploy 一次

## 第 5 步 · 管理员 & 备份
- **成为管理员（Vercel 远程模式）**：注册你的账号 → 打开 `/admin` → 点「🎉 我是第一个用户，成为管理员」（系统还没有管理员时才可用，引导一次后自动关闭）。之后其他用户再无此入口。
- 本地 / CloudStudio 模式仍可用命令行：`node scripts/set-admin.mjs <用户名>`
- **备份**：管理后台「下载数据库备份」在远程模式导出 JSON 全量；也可用 Turso 控制台的 Snapshot / Dump 定期导出 SQL。

## 常见问题
| 问题 | 解决 |
| --- | --- |
| 登录后数据不保存 | 环境变量没生效 → 检查后 Redeploy |
| Vercel 报错 500 | Vercel 日志 → Functions 看报错；多为 TURSO_URL 格式错误 |
| 国内访问慢 | 换 CloudStudio/自购服务器（见 deploy-cloudstudio.md） |
| 想用自己的域名 | Vercel 项目 → Domains 添加 |
