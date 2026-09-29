#!/usr/bin/env node
/**
 * figma-pull.mjs — 把 Figma 设计稿拉到本地，供「照着设计稿改代码」使用。
 *
 * 为什么不用 MCP：本机没装 Figma 桌面版、也没开 Dev Mode（官方 Dev Mode MCP 需要
 * 桌面版 + 付费席位 + 本地 3845 端口）。而 api.figma.com 的网络是通的，用官方 REST API
 * 直接读文件更省事，免费账号就能用。
 *
 * 用法（在 E:\初二\web 下运行）：
 *   D:\nodejs\node.exe scripts/figma-pull.mjs list <Figma链接或fileKey>
 *   D:\nodejs\node.exe scripts/figma-pull.mjs pull <Figma链接或fileKey> [--ids 1:2,3:4] [--scale 2] [--out docs/figma]
 *
 *   list  只列页面 / 画板（先看清文件里有什么）
 *   pull  拉取指定画板：导出 PNG + 生成 spec.md（颜色/字号/圆角/间距/文字全在里面）
 *         不给 --ids 时自动取所有顶层画板（最多 20 个）
 *
 * Token 来源（按顺序，任选其一）：
 *   1. 环境变量 FIGMA_TOKEN
 *   2. 文件 E:\dsh\secrets\figma-token.txt （推荐：不要把 token 贴在聊天里，会被写进会话记录）
 *
 * 怎么拿 token：Figma 右上角头像 → Settings → Security → Personal access tokens →
 *   Generate new token → 权限只勾「File content: Read-only」→ 复制（只显示一次）。
 *   只读 token 只能看稿子，改不了你的账号，泄露了损失也可控。
 *
 * 已知限制：
 *   - Variables（本地变量/色板）接口要 Figma 企业版，免费/专业版读不到；颜色仍可从图层填充里统计。
 *   - 免费版接口有速率限制，拉大文件会慢；遇到 429 就等一会儿再跑。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const TOKEN_FILE = "E:\\dsh\\secrets\\figma-token.txt";
const API = "https://api.figma.com/v1";

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const mode = argv[0];
const target = argv[1];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const OUT_DIR = resolve(flag("out", "docs/figma"));
const SCALE = Number(flag("scale", "2")) || 2;
const IDS_ARG = flag("ids", "");

class Fail extends Error {}
const fail = (msg) => {
  throw new Fail(msg);
};

const USAGE = `figma-pull.mjs — 拉取 Figma 设计稿

  list <链接或fileKey>                     列出文件里的页面和画板
  pull <链接或fileKey> [选项]              拉取画板：导出 PNG + 生成 spec.md

选项：
  --ids 1:2,3:4     指定画板 id（逗号分隔；不给就拉全部顶层画板，最多 20 个）
  --scale 2         导出倍率，默认 2
  --out docs/figma  输出目录，默认 docs/figma

Token：环境变量 FIGMA_TOKEN，或 ${TOKEN_FILE}
`;

// ---------- token ----------
function loadToken() {
  let raw = (process.env.FIGMA_TOKEN || "").trim();
  let where = "环境变量 FIGMA_TOKEN";
  if (!raw && existsSync(TOKEN_FILE)) {
    raw = readFileSync(TOKEN_FILE, "utf8").trim();
    where = TOKEN_FILE;
  }
  if (raw) {
    // 容忍常见的粘贴事故：引号、Bearer 前缀、token 后面跟了换行/说明文字
    raw = raw.replace(/^["'`]|["'`]$/g, "").replace(/^Bearer\s+/i, "").split(/\s+/)[0];
    if (raw.length < 20) {
      fail(
        `从 ${where} 读到的内容不像 Figma token：\n  ${raw.slice(0, 16)}…\n` +
          "  token 是 figd_ 开头的一长串。确保那里只有一行 token，没有多余的说明文字。"
      );
    }
    return raw;
  }
  fail(
    "没找到 Figma token。\n" +
      `  方式一（推荐）：把 token 写进 ${TOKEN_FILE}（只放一行 token，别的都不要写）\n` +
      "  方式二：$env:FIGMA_TOKEN='figd_xxx' 后再跑\n" +
      "  获取：Figma 头像 → Settings → Security → Personal access tokens → 只勾 File content: Read-only"
  );
}

// ---------- 目标解析 ----------
function parseTarget(input) {
  // 支持 https://www.figma.com/design/<key>/<名字>?node-id=1-2 以及 /file/ /board/ /proto/
  const m = input.match(/figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]+)/);
  const fileKey = m ? m[1] : input.trim();
  if (!/^[A-Za-z0-9]{10,}$/.test(fileKey)) {
    fail(`看不懂这个文件标识：${input}\n  正确形式：https://www.figma.com/design/xxxxxxxx/名字 或直接给 fileKey`);
  }
  const nm = input.match(/node-id=([0-9]+[-:][0-9]+)/);
  return { fileKey, nodeId: nm ? nm[1].replace("-", ":") : null };
}

// ---------- 请求 ----------
let token = "";
async function api(pathAndQuery) {
  const res = await fetch(API + pathAndQuery, { headers: { "X-Figma-Token": token } });
  if (res.ok) return res.json();
  const raw = await res.text().catch(() => "");
  let err = "";
  try {
    err = JSON.parse(raw).err || JSON.parse(raw).message || "";
  } catch {}
  const hint =
    /invalid token/i.test(err) || res.status === 401
      ? "token 无效、抄错了或已被撤销 —— 重新生成一个（注意 figd_ 开头的完整串）"
      : res.status === 403
        ? "token 有效，但没有这个文件的权限（确认文件在你自己的账号/团队里）"
        : res.status === 404
          ? "文件不存在，或者 fileKey 抄错了"
          : res.status === 429
            ? "被 Figma 限流了，等 1 分钟再跑"
            : res.status === 400
              ? "请求有问题（fileKey 或 node id 格式不对）"
              : "未知错误";
  fail(`Figma 返回 ${res.status}：${hint}\n  ${(err || raw).slice(0, 300)}`);
}

// ---------- 格式化工具 ----------
function walk(node, cb, depth = 0) {
  cb(node, depth);
  for (const c of node.children || []) walk(c, cb, depth + 1);
}
function toHex(c, a) {
  const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return a === undefined || a >= 1 ? base : `${base} ${Math.round(a * 100)}%`;
}
function paint(p) {
  if (!p || p.visible === false) return null;
  if (p.type === "SOLID") return toHex(p.color, p.opacity);
  if (p.type && p.type.startsWith("GRADIENT")) {
    const stops = (p.gradientStops || []).map((s) => toHex(s.color, s.color.a)).join(" → ");
    return `渐变(${stops})`;
  }
  if (p.type === "IMAGE") return `图片(${p.scaleMode || ""})`;
  return p.type;
}
function effect(e) {
  if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
    const off = e.offset || { x: 0, y: 0 };
    return `${e.type === "DROP_SHADOW" ? "外阴影" : "内阴影"} ${off.x}px ${off.y}px ${e.radius}px ${toHex(e.color, e.color.a)}`;
  }
  return e.type;
}
function bbox(n) {
  const b = n.absoluteBoundingBox;
  return b ? `${Math.round(b.width)}×${Math.round(b.height)}` : "—";
}
function corner(n) {
  if (n.rectangleCornerRadii) return n.rectangleCornerRadii.join("/");
  if (typeof n.cornerRadius === "number") return String(n.cornerRadius);
  return "";
}
function layout(n) {
  if (!n.layoutMode || n.layoutMode === "NONE") return "";
  const dir = n.layoutMode === "HORIZONTAL" ? "横向" : "纵向";
  const pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map((v) => v ?? 0).join("/");
  return `${dir}排列 间距${n.itemSpacing ?? 0} 内边距${pad}`;
}
function textStyle(n) {
  const s = n.style || {};
  const lh = s.lineHeightPx ? `/${Math.round(s.lineHeightPx)}` : "";
  const ls = s.letterSpacing ? ` 字距${Math.round(s.letterSpacing * 100) / 100}` : "";
  return `${s.fontFamily || "?"} ${Math.round(s.fontSize || 0)}px${lh} 字重${s.fontWeight || 400}${ls}`;
}
const esc = (s) => String(s).replace(/\|/g, "/").replace(/\n/g, " ");

// ---------- list ----------
async function runList({ fileKey }) {
  const data = await api(`/files/${fileKey}?depth=2`);
  console.log(`\n文件：${data.name}   最后修改：${new Date(data.lastModified).toLocaleString("zh-CN")}\n`);
  for (const page of data.document.children || []) {
    console.log(`■ 页面：${page.name}`);
    for (const f of page.children || []) {
      console.log(`    ${String(f.type).padEnd(12)} ${String(f.id).padEnd(10)} ${f.name}  ${bbox(f)}`);
    }
  }
  console.log(`\n下一步：node scripts/figma-pull.mjs pull ${fileKey} --ids <画板id，逗号分隔>\n`);
}

// ---------- pull ----------
async function runPull({ fileKey, nodeId }) {
  const file = await api(`/files/${fileKey}?depth=1`);
  const ids = IDS_ARG
    ? IDS_ARG.split(",").map((s) => s.trim()).filter(Boolean)
    : nodeId
      ? [nodeId]
      : (() => {
          const out = [];
          for (const page of file.document.children || []) {
            for (const f of page.children || []) {
              if (["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION"].includes(f.type) && out.length < 20) out.push(f.id);
            }
          }
          return out;
        })();
  if (!ids.length) fail("这个文件里没找到画板。用 list 看看结构，再用 --ids 指定。");

  const nodesRes = await api(`/files/${fileKey}/nodes?ids=${ids.join(",")}`);
  const imgRes = await api(`/images/${fileKey}?ids=${ids.join(",")}&format=png&scale=${SCALE}`);

  const slug = (file.name || "figma").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "figma";
  const dir = join(OUT_DIR, slug);
  mkdirSync(join(dir, "png"), { recursive: true });
  mkdirSync(join(dir, "raw"), { recursive: true });

  const colors = new Map();
  const textStyles = new Map();
  const samples = [];
  const body = [];

  for (const id of ids) {
    const doc = nodesRes.nodes?.[id]?.document;
    if (!doc) {
      body.push(`## ${id} — 拉取失败（可能已删除或无权限）`, "");
      continue;
    }
    writeFileSync(join(dir, "raw", `${id.replace(":", "-")}.json`), JSON.stringify(nodesRes.nodes[id], null, 2));

    const rows = [];
    walk(doc, (n, depth) => {
      if (n.visible === false) return;
      const fills = (n.fills || []).map(paint).filter(Boolean);
      for (const f of fills) if (f.startsWith("#")) colors.set(f, (colors.get(f) || 0) + 1);
      if (n.type === "TEXT") {
        const st = textStyle(n);
        textStyles.set(st, (textStyles.get(st) || 0) + 1);
        if (n.characters && samples.length < 200) samples.push(`| ${esc(n.characters).slice(0, 36)} | ${st} |`);
      }
      const parts = [
        n.type,
        `尺寸 ${bbox(n)}`,
        fills.length ? `填充 ${fills.join(" + ")}` : "",
        n.strokes?.length ? `描边 ${n.strokes.map(paint).filter(Boolean).join("/")} ${n.strokeWeight ?? ""}px` : "",
        corner(n) ? `圆角 ${corner(n)}` : "",
        n.effects?.length ? n.effects.map(effect).join("；") : "",
        layout(n),
        n.type === "TEXT" ? st_(n) : "",
        n.opacity !== undefined && n.opacity < 1 ? `透明度 ${Math.round(n.opacity * 100)}%` : "",
      ].filter(Boolean);
      rows.push(`| ${"·".repeat(depth)} ${esc(n.name)} | ${parts.join(" · ")} |`);
    });

    const img = imgRes.images?.[id];
    if (img) {
      const buf = Buffer.from(await (await fetch(img)).arrayBuffer());
      writeFileSync(join(dir, "png", `${id.replace(":", "-")}.png`), buf);
    }

    body.push(`## ${esc(doc.name)}  \`${id}\``, "", `画板尺寸：${bbox(doc)}${layout(doc) ? " · " + layout(doc) : ""}`, "");
    if (img) body.push(`![${esc(doc.name)}](png/${id.replace(":", "-")}.png)`, "");
    else body.push(`> ⚠️ 这张图导出失败（${imgRes.err || "无原因"}）`, "");
    body.push(`| 图层 | 规格 |`, `| --- | --- |`, ...rows, "");
  }

  const md = [
    `# Figma 稿规格：${file.name}`,
    "",
    `> 自动生成，勿手改。重跑：\`node scripts/figma-pull.mjs pull ${fileKey}\``,
    "",
    "## 全稿颜色直方图（对到 globals.css 的 :root 变量）",
    "",
    "| 色值 | 出现次数 |",
    "| --- | --- |",
    ...[...colors.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| \`${c}\` | ${n} |`),
    "",
    "## 全稿文字样式",
    "",
    "| 样式 | 出现次数 |",
    "| --- | --- |",
    ...[...textStyles.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `| ${esc(t)} | ${n} |`),
    "",
    "## 文字内容抽样（看文案和层级）",
    "",
    "| 内容 | 样式 |",
    "| --- | --- |",
    ...samples,
    "",
    ...body,
  ].join("\n");

  const mdPath = join(dir, "spec.md");
  writeFileSync(mdPath, md);
  console.log(`\n✓ 完成：${mdPath}`);
  console.log(`  图片：${join(dir, "png")}（${ids.length} 张，${SCALE}x）`);
  console.log(`  原始数据：${join(dir, "raw")}\n`);
}
// textStyle 的短别名（表格里少占字符）
const st_ = textStyle;

// ---------- 跑 ----------
try {
  if (!mode || !target || !["list", "pull"].includes(mode)) {
    console.log(USAGE);
    process.exitCode = 1;
  } else {
    token = loadToken();
    const t = parseTarget(target);
    if (mode === "list") await runList(t);
    else await runPull(t);
  }
} catch (e) {
  if (e instanceof Fail) {
    console.error("\n✗ " + e.message + "\n");
    process.exitCode = 1;
  } else {
    throw e;
  }
}
