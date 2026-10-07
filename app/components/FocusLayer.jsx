"use client";

// ============================================================
// app/components/FocusLayer.jsx —— 纸间专注（全屏覆盖层）
// ------------------------------------------------------------
// 方向见 挑战杯-2026/词跃-纸间专注v3-方向-2026-10-05.md（唯一依据）
//
// 一句话定位：**一个「我在屏幕外做的事」的记录本。**
//   屏幕上只有时间 —— 不出题、不判对错、不出现单词。
//   这是它之所以存在的理由：学生去背书、写试卷，设备只是桌上一个钟。
//
// 【2026-10-05 用户明确砍掉的三件事，别加回来】
//   ❌ 监督（不记中断次数、不做家长周报）  ❌ 排行榜  ❌ 自报时长喂给调度器
//
// ⚠️ 三条能力边界（别以为能做）：
//   ① 网页做不到真监督 —— 浏览器拦不住切 App。本版压根不做监督。
//   ② iPhone Safari 不支持元素全屏 → 用 position:fixed 覆盖层；安卓 Chrome 走真全屏。
//   ③ wakeLock 保持屏幕常亮，页面隐藏时释放、回来重申请，**失败必须静默降级**。
//
// ⚠️ 计时用**时间戳差值**，不用 setInterval 累加 ——
//   后台标签页会被节流（降到 1 次/分钟甚至冻结），累加会少算，少算多少还不可预期。
//   这里 setInterval 只负责「重绘」，不负责「计数」。
//
// 渲染方式：createPortal 到 body。
//   不渲染在书壳里，是因为书壳有 bs-rise 动画，动画期间 transform 会成为
//   position:fixed 的包含块，覆盖层就会被裁在书壳那一块里。
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { USES, PRESETS, MODES, addSession, addCustomUse, customUses, todaySummary } from "@/lib/focus";
import { focusPraiseFor } from "@/lib/praise";
import { sync } from "@/lib/sync";
import { onFocusChange, isFocusOpen, closeFocus } from "@/lib/focus-ui";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** 毫秒 -> "01:23:45"（前导的 0 小时不显示，读起来更干净） */
function hms(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
}

/** 下一个整点，作为「定时」的默认截止时刻 */
function nextHourTs() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

function hhmm(ts) {
  const d = new Date(ts);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export default function FocusLayer() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setMounted(true);
    setOpen(isFocusOpen());
    return onFocusChange(setOpen);
  }, []);
  if (!mounted || !open) return null;
  return createPortal(<Panel />, document.body);
}

function Panel() {
  const [phase, setPhase] = useState("pick"); // pick | run | done
  const [use, setUse] = useState(USES[0]);
  const [otherName, setOtherName] = useState("");
  const [mode, setMode] = useState("countdown");
  const [planMin, setPlanMin] = useState(30);
  const [deadline, setDeadline] = useState(nextHourTs);
  const [startedAt, setStartedAt] = useState(0);
  const [pausedTotal, setPausedTotal] = useState(0);
  const [pauseFrom, setPauseFrom] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [record, setRecord] = useState(null);
  const [saved, setSaved] = useState(null);
  const layerRef = useRef(null);

  // 今天各用途做了几次 —— 用途按钮上直接显示，是可行动的数字
  const [today, setToday] = useState(() => ({ count: 0, ms: 0, byUse: {} }));
  const [customs, setCustoms] = useState([]);
  useEffect(() => {
    setToday(todaySummary());
    setCustoms(customUses());
  }, []);

  // ---- 重绘用的一秒一跳；它不负责计数 ----
  useEffect(() => {
    if (phase !== "run") return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const paused = pauseFrom > 0;
  const elapsed = useMemo(() => {
    if (!startedAt) return 0;
    const pauseNow = paused ? now - pauseFrom : 0;
    return Math.max(0, now - startedAt - pausedTotal - pauseNow);
  }, [now, startedAt, pausedTotal, paused, pauseFrom]);

  // ---- 屏幕常亮（失败静默） ----
  useEffect(() => {
    if (phase !== "run") return undefined;
    if (typeof navigator === "undefined" || !navigator.wakeLock) return undefined;
    let lock = null;
    let alive = true;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* iOS / 权限 / 不支持：静默降级，钟照样走 */
      }
    };
    request();
    const onVis = () => {
      if (alive && document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      try {
        if (lock) lock.release();
      } catch {
        /* ignore */
      }
    };
  }, [phase]);

  // ---- 退出清场 ----
  const dismiss = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
    closeFocus();
  }, []);

  const start = useCallback(() => {
    const name = use === "其他" ? (otherName.trim() || "其他") : use;
    if (use === "其他" && otherName.trim()) addCustomUse(otherName.trim());
    setUse(name);
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setPausedTotal(0);
    setPauseFrom(0);
    setRecord(null);
    setPhase("run");
    // 真全屏只在安卓 Chrome 有；iOS Safari 会抛，静默忽略即可
    try {
      const el = layerRef.current;
      if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
  }, [use, otherName]);

  const finish = useCallback(() => {
    const actualMs = elapsed;
    const planMs = mode === "countdown" ? planMin * 60000 : mode === "clock" ? Math.max(0, deadline - startedAt) : 0;
    addSession({ use, mode, planMs, actualMs, done: true });
    const t = todaySummary();
    setToday(t);
    setSaved({ actualMs, todayMs: t.ms });
    setPhase("done");
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
  }, [elapsed, mode, planMin, deadline, startedAt, use]);

  const cancel = useCallback(() => {
    // ⚠️ 取消**不写记录**。
    //    记"他放弃了"就是变相监督 —— 而用户 2026-10-05 明确把监督砍掉了。
    dismiss();
  }, [dismiss]);

  const name = (sync.user && (sync.user.nickname || sync.user.username)) || "";

  // ================= 渲染 =================
  return (
    <div className="focus-layer" ref={layerRef} role="dialog" aria-label="纸间专注">
      {phase === "pick" && (
        <Pick
          use={use} setUse={setUse}
          otherName={otherName} setOtherName={setOtherName} customs={customs}
          mode={mode} setMode={setMode}
          planMin={planMin} setPlanMin={setPlanMin}
          deadline={deadline} setDeadline={setDeadline}
          today={today} onStart={start} onCancel={dismiss}
        />
      )}

      {phase === "run" && (
        <Run
          use={use} mode={mode} elapsed={elapsed} planMin={planMin} deadline={deadline}
          paused={paused}
          onPause={() => setPauseFrom(Date.now())}
          onResume={() => { setPausedTotal((v) => v + (Date.now() - pauseFrom)); setPauseFrom(0); }}
          onFinish={finish} onCancel={cancel}
        />
      )}

      {phase === "done" && (
        <Done saved={saved} name={name} use={use} today={today} onAgain={() => setPhase("pick")} onClose={dismiss} />
      )}
    </div>
  );
}

// ---------------- ① 选用途 + 计时方式 ----------------
function Pick({ use, setUse, otherName, setOtherName, customs, mode, setMode, planMin, setPlanMin, deadline, setDeadline, today, onStart, onCancel }) {
  return (
    <div className="focus-pick">
      <div className="focus-head">
        <b>纸间专注</b>
        <span>你要去做什么？我帮你记着。</span>
      </div>

      <div className="focus-sec">用途</div>
      <div className="focus-uses">
        {USES.map((u) => {
          const n = (today.byUse && today.byUse[u] && today.byUse[u].count) || 0;
          return (
            <button
              key={u}
              className={"focus-use" + (use === u ? " on" : "")}
              data-use={u}
              onClick={() => setUse(u)}
            >
              <b>{u}</b>
              <span>{n > 0 ? "今天第 " + (n + 1) + " 次" : "今天还没做"}</span>
            </button>
          );
        })}
      </div>

      {use === "其他" && (
        <div className="focus-other">
          <input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder="想记什么？（最多 20 字）"
            maxLength={20}
          />
          {customs.length > 0 && (
            <div className="focus-other-hints">
              {customs.map((c) => (
                <button key={c} className="focus-chip" onClick={() => setOtherName(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="focus-sec">怎么计时</div>
      <div className="focus-modes">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={"focus-mode" + (mode === m.key ? " on" : "")}
            data-mode={m.key}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="focus-mode-hint">
        {mode === "stopwatch" && "做到哪算哪，我看着就行。"}
        {mode === "countdown" && "给自己定一段时长 —— 背书、背单词常用。"}
        {mode === "clock" && "给这件事定一个截止时刻 —— 写试卷、语法填空常用。"}
      </div>

      {mode === "countdown" && (
        <div className="focus-plan">
          {PRESETS.map((m) => (
            <button key={m} className={"focus-chip" + (planMin === m ? " on" : "")} onClick={() => setPlanMin(m)}>{m} 分钟</button>
          ))}
          <input
            type="number" min="1" max="180"
            value={planMin}
            onChange={(e) => setPlanMin(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
            aria-label="自定义分钟数"
          />
        </div>
      )}

      {mode === "clock" && (
        <div className="focus-plan">
          <span className="focus-plan-label">截止时刻</span>
          <input
            type="time"
            value={hhmm(deadline)}
            onChange={(e) => {
              const parts = String(e.target.value || "").split(":");
              const d = new Date();
              d.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
              if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // 过了今天这个点，就算明天
              setDeadline(d.getTime());
            }}
          />
        </div>
      )}

      {today.count > 0 && (
        <div className="focus-today">
          今天：{Object.keys(today.byUse || {}).map((k) => k + " " + today.byUse[k].count + " 次").join(" · ")}
          {" · 共 " + Math.round((today.ms || 0) / 60000) + " 分钟"}
        </div>
      )}

      <div className="focus-acts">
        <button className="focus-start" onClick={onStart}>开始</button>
        <button className="focus-cancel" onClick={onCancel}>先不用</button>
      </div>
    </div>
  );
}

// ---------------- ② 计时中：屏幕上只有时间 ----------------
function Run({ use, mode, elapsed, planMin, deadline, paused, onPause, onResume, onFinish, onCancel }) {
  const d = new Date();
  const dateStr = d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";

  let main;
  let sub;
  if (mode === "countdown") {
    const left = planMin * 60000 - elapsed;
    main = left >= 0 ? hms(left) : "+" + hms(-left);
    sub = left >= 0 ? "还剩" : "已超出";
  } else if (mode === "clock") {
    const left = deadline - Date.now();
    main = left >= 0 ? hms(left) : "+" + hms(-left);
    sub = hhmm(deadline) + " 前完成 · " + (left >= 0 ? "还剩" : "已超出");
  } else {
    main = hms(elapsed);
    sub = "正计时";
  }

  const timeUp = (mode === "countdown" && elapsed >= planMin * 60000) || (mode === "clock" && Date.now() >= deadline);

  return (
    <div className="focus-run">
      <div className="focus-date">{dateStr}</div>
      <div className="focus-clock">{main}</div>
      <div className="focus-sub">
        {sub} · 正在 {use}
        {paused ? " · 已暂停" : ""}
      </div>
      {timeUp && <div className="focus-timeup">时间到了 —— 做完手上这一点再收。</div>}
      <div className="focus-acts">
        {paused ? (
          <button className="focus-pause" onClick={onResume}>继续</button>
        ) : (
          <button className="focus-pause" onClick={onPause}>暂停</button>
        )}
        <button className="focus-finish" onClick={onFinish}>完成</button>
        <button className="focus-cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

// ---------------- ③ 完成：花哨预算花在这里 ----------------
function Done({ saved, name, use, today, onAgain, onClose }) {
  const praise = focusPraiseFor({
    name,
    minutes: Math.round(((saved && saved.actualMs) || 0) / 60000),
    todayMs: (saved && saved.todayMs) || 0,
  });
  const mins = Math.round(((saved && saved.actualMs) || 0) / 60000);
  return (
    <div className="focus-done">
      <div className="focus-done-use">{use}</div>
      <div className="focus-done-min">{mins > 0 ? mins + " 分钟" : "不到 1 分钟"}</div>
      <div className="focus-praise">
        <div className="focus-praise-hello">{praise.hello}</div>
        {praise.fact ? <div className="focus-praise-fact">{praise.fact}</div> : null}
      </div>
      {today.count > 0 && (
        <div className="focus-today">
          今天：{Object.keys(today.byUse || {}).map((k) => k + " " + today.byUse[k].count + " 次").join(" · ")}
        </div>
      )}
      <div className="focus-acts">
        <button className="focus-start" onClick={onAgain}>再来一段</button>
        <button className="focus-finish" onClick={onClose}>收好了</button>
      </div>
    </div>
  );
}