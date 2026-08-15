// ecosystem.config.cjs —— PM2 进程守护配置（部署时用）
// 用法: pm2 start ecosystem.config.cjs && pm2 save
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
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
