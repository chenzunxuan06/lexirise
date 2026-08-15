// scripts/serve.mjs —— 本地静态预览服务器（零依赖，Node 内置模块）
// 用法: node scripts/serve.mjs [port]  默认 3000
// 服务 web/out/ 目录（next build 静态导出产物）
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
  } catch {
    /* not found */
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path === "/") path = "/index.html";
    let file = join(ROOT, normalize(path).replace(/^([/\\])+/, ""));
    if (!(await tryFile(file))) {
      // Next 静态导出: /train -> train.html 或 train/index.html
      const alt1 = join(ROOT, path.replace(/\/$/, "") + ".html");
      const alt2 = join(ROOT, path, "index.html");
      file = (await tryFile(alt1)) || (await tryFile(alt2));
    }
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 " + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`LexiRise static preview: http://localhost:${PORT}  (root: ${ROOT})`);
});
