"use client";

// ============================================================
// 设置页 /settings：主题（跟系统/浅/深）· 音效 · 每日目标 · 引导
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readSettings, saveSettings, onSettingsChange } from "@/lib/settings";
import { plan } from "@/lib/memory";
import { game } from "@/lib/game";
import { PACES, readPace, applyPace } from "@/lib/pace";
import PetEmpty from "../components/PetEmpty";

const ONBOARD_FLAG = "lexirise:onboarded";
const XP_CAP = 200;

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(readSettings);
  const [dailyNew, setDailyNew] = useState(0);
  const [pace, setPace] = useState(null);
  const [gs, setGs] = useState(null);

  useEffect(() => {
    setDailyNew(plan.load().dailyNew || 10);
    setPace(readPace());
    setGs(game.state());
    const offSettings = onSettingsChange(() => setSettings(readSettings()));
    return offSettings;
  }, []);

  const g = gs || game.state();

  // 水合安全：首帧（含 SSR）不渲染 localStorage 数据，挂载后再渲染
  if (!gs) {
    return (
      <div className="wrap">
        <PetEmpty action="book" title="加载设置…" sub="跃跃在帮你整理偏好" />
      </div>
    );
  }

  function toggleSound() {
    saveSettings({ sound: !readSettings().sound });
  }

  function setGoal(n) {
    const v = Math.max(1, Math.min(50, n));
    plan.setDailyNew(v);
    setDailyNew(v);
    // 手动拧过旋钮就不再等于任何一档 —— 立刻反映成"自定义"
    setPace(readPace());
  }

  /** 选一档节奏：两个旋钮一起写（见 lib/pace.js） */
  function choosePace(key) {
    applyPace(key);
    const r = readPace();
    setPace(r);
    setDailyNew(r.dailyNew); // 下面的「每日目标」要跟着动，两个数字不能各说各话
  }

  function replayOnboard() {
    try {
      localStorage.removeItem(ONBOARD_FLAG);
    } catch { /* ignore */ }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>设置</h1>
          <span className="en">Settings</span>
        </div>
        <p className="tagline">外观 · 声音 · 学习目标 · 引导</p>
      </header>

      {/* 版式（方向C 活页本 / 经典） */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">📖 版式</h2>
          <span className="section-sub">活页本（新）· 经典（旧），随时可切回</span>
        </div>
        <div className="settings-row">
          <span>界面版式</span>
          <div className="tabs mini-tabs">
            <button
              className={"tab" + ((settings.shell || "book") === "book" ? " active" : "")}
              onClick={() => saveSettings({ shell: "book" })}
            >
              活页本
            </button>
            <button
              className={"tab" + ((settings.shell || "book") === "classic" ? " active" : "")}
              onClick={() => saveSettings({ shell: "classic" })}
            >
              经典版
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span>桌面端显示书签 + 三栏；手机端两种都用底部导航</span>
        </div>
      </div>

      {/* 外观（深色模式已下线，固定浅色纸墨风） */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🎨 外观</h2>
          <span className="section-sub">浅色纸墨风（深色模式已下线）</span>
        </div>
        <div className="settings-row">
          <span>当前为浅色纸墨模式 · 深色模式暂时下线，仅保留浅色</span>
        </div>
      </div>

      {/* 声音 */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🔊 音效</h2>
          <span className="section-sub">答对 / 答错 / 连对 / 开箱 / 升级提示音（WebAudio 合成，无网络）</span>
        </div>
        <div className="settings-row">
          <span>游戏音效</span>
          <button
            className={"settings-toggle" + (settings.sound ? " on" : "")}
            onClick={toggleSound}
            aria-label="游戏音效开关"
          >
            <i />
          </button>
        </div>
      </div>

      {/* 学习节奏（2026-10-07 新增）—— 每日预算的两档预设。
          为什么把它放在「每日目标」上面：每日目标只是其中一个旋钮，
          节奏才是"这周我到底想要什么"的那个选择。 */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🧭 学习节奏</h2>
          <span className="section-sub">目前：{(pace || readPace()).label}</span>
        </div>
        <div className="settings-row">
          <span>两档预算</span>
          <div className="tabs mini-tabs">
            {PACES.map((p) => (
              <button
                key={p.key}
                className={"tab" + ((pace || readPace()).key === p.key ? " active" : "")}
                onClick={() => choosePace(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span>
            {PACES.map((p) => p.label + "：新词 " + p.dailyNew + " · 复习上限 " + p.reviewCap).join("　｜　")}
          </span>
        </div>
        <div className="settings-row">
          {/* 丙：把取舍写在学生看得见的地方，而不是藏在报告里 */}
          <span>
            这两个目标在固定预算下<b>互相挤占</b>：考前档保住"下次听写还记得"，
            假期档补"一学期后还记得"。实测每日 12 词时期末熟练词为 0，24–30 词才回得来
            （研究报告 §3.2.3）—— 所以这不是哪个更好，是你现在更想要哪一个。
            想自己调，用下面的「每日目标」加减，节奏会自动变成"自定义"。
          </span>
        </div>
      </div>

      {/* 学习目标 */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🎯 每日目标</h2>
          <span className="section-sub">首页「今日三件事 · 新词学习」按此安排</span>
        </div>
        <div className="settings-row">
          <span>每天新学单词数</span>
          <div className="settings-stepper">
            <button onClick={() => setGoal(dailyNew - 1)} disabled={dailyNew <= 1}>−</button>
            <b>{dailyNew}</b>
            <button onClick={() => setGoal(dailyNew + 1)} disabled={dailyNew >= 50}>+</button>
          </div>
        </div>
      </div>

      {/* 我的档案 */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🏆 我的档案</h2>
          <span className="section-sub">游戏进度一览</span>
        </div>
        <div className="settings-profile">
          <div><b>Lv.{g.level}</b><span>等级</span></div>
          <div><b>{g.title}</b><span>称号</span></div>
          <div><b>⭐ {g.xp}</b><span>XP</span></div>
          <div><b>🪙 {g.coins}</b><span>金币</span></div>
          <div><b>{g.badges?.length || 0}</b><span>徽章</span></div>
          <div><b>{g.daily.xp}/{XP_CAP}</b><span>今日 XP</span></div>
        </div>
        <div className="settings-link">
          <Link href="/achievements">去成就页查看徽章墙 →</Link>
          <Link href="/stats">去统计页查看打卡 →</Link>
        </div>
      </div>

      {/* 引导 */}
      <div className="setup-card">
        <div className="section-row">
          <h2 className="section-h">🎓 新手指引</h2>
          <span className="section-sub">已完成后不会主动弹出；随时可重新观看</span>
        </div>
        <button className="start-btn" onClick={replayOnboard} style={{ width: "100%" }}>
          重新观看新手指引（5 步）
        </button>
      </div>

      <footer className="footer">词跃 LexiRise · 设置仅保存在本机，登录后学习数据云端同步</footer>
    </div>
  );
}