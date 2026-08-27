// ecosystem.config.cjs —— PM2 进程守护配置（部署时用）
// 用法: pm2 start ecosystem.config.cjs && pm2 save
// AI 配置：部署时在 shell 里 export LLM_API_KEY=...（及可选的
// LLM_BASE_URL / LLM_MODEL），PM2 会把它们带进进程；
// 不设置则系统自动降级为"AI 未配置"，其余功能照常。
module.exports = {
  apps: [
    {
      name: "lexirise",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: (() => {
        const env = { NODE_ENV: "production" };
        if (process.env.LLM_API_KEY) env.LLM_API_KEY = process.env.LLM_API_KEY;
        if (process.env.LLM_BASE_URL) env.LLM_BASE_URL = process.env.LLM_BASE_URL;
        if (process.env.LLM_MODEL) env.LLM_MODEL = process.env.LLM_MODEL;
        return env;
      })()
    }
  ]
};