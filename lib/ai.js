// ============================================================
// lib/ai.js —— LLM 客户端（OpenAI 兼容，服务端专用）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 环境变量（web/.env.local）：
//   LLM_BASE_URL   接口地址，默认 https://api.deepseek.com
//   LLM_API_KEY    密钥（只存在于服务端，绝不进前端）
//   LLM_MODEL      模型名，默认 deepseek-chat
// 任何 OpenAI 兼容的 /chat/completions 服务都能接（DeepSeek/
// opencode 网关/通义/GLM...），切换 = 改环境变量，零改代码。
// ============================================================

const BASE_URL = (process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "deepseek-chat";

export class AiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** 是否已配置 AI 服务（前端靠 /api/ai/status 判断降级） */
export const aiConfigured = () => !!API_KEY && !!MODEL;

function stripFence(text) {
  let t = String(text || "").trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) t = m[1].trim();
  return t;
}

export function parseJson(text) {
  const t = stripFence(text);
  try {
    return JSON.parse(t);
  } catch {
    /* fallthrough */
  }
  // 兜底：截取第一个 { 到最后一个 } 再试一次
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 调用一次 LLM（OpenAI 兼容）
 * @param {Array} messages [{role, content}]
 * @param {Object} opts { json, maxTokens, temperature, timeoutMs }
 * @returns {Promise<object|string>} json=true 时返回解析后的对象；否则返回纯文本
 */
export async function chat(messages, opts = {}) {
  const {
    json = true,
    maxTokens = 1200,
    temperature = 0.6,
    timeoutMs = 45000,
  } = opts;
  if (!aiConfigured()) throw new AiError("AI 服务未配置", 501);

  const body = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };

  let ctrl = null;
  let timer = null;
  if (typeof AbortController !== "undefined") {
    ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const d = await res.json();
        detail = (d.error && d.error.message) || "";
      } catch {
        /* ignore */
      }
      const status = res.status >= 500 ? 503 : 502;
      throw new AiError(`AI 服务错误 (${res.status})${detail ? "：" + detail : ""}`, status);
    }
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    if (!text) throw new AiError("AI 返回为空", 502);
    if (json) {
      const parsed = parseJson(text);
      if (parsed === null) throw new AiError("AI 返回格式无法解析，请重试", 502);
      return parsed;
    }
    return text.trim();
  } catch (e) {
    if (e && e.name === "AbortError") throw new AiError("AI 响应超时，请稍后重试", 503);
    if (e instanceof AiError) throw e;
    throw new AiError("AI 服务暂时不可用", 503);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 带重试的调用：503/429 网络类错误重试 1 次；
 * JSON 解析失败时追加"只输出 JSON"再试 1 次。
 */
export async function chatRobust(messages, opts = {}) {
  const { json = true } = opts;
  try {
    return await chat(messages, opts);
  } catch (e) {
    if (e instanceof AiError && (e.status === 502 || e.status === 503)) {
      const retryMsgs = json
        ? [...messages, { role: "user", content: "请只输出一个 JSON 对象，不要任何其他文字。" }]
        : messages;
      return await chat(retryMsgs, opts);
    }
    throw e;
  }
}

export default chat;