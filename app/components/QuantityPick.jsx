"use client";

// ============================================================
// app/components/QuantityPick.jsx —— 「这次背多少」选择器（阶段 2）
// 10/20/30/剩的/全部/自定义，记住上次；自定义弹输入。
// ============================================================

import { useState } from "react";
import { quantityOptions, readQuantity, saveQuantity, resolveQuantity } from "@/lib/quantity";

export default function QuantityPick({ grade, semester, unit, unitWords, left, onStart }) {
  const [selUid, setSelUid] = useState(null); // {kind,value} uid 态（本组件内重选）
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [chosen, setChosen] = useState(null); // 当前生效选择对象

  const opts = quantityOptions({ unitWords, left });
  const last = readQuantity(grade, semester, unit);
  const active = chosen || (last ? { kind: last.kind, value: last.value } : null);

  function pick(kind, value) {
    const sel = { kind, value };
    saveQuantity(grade, semester, unit, kind, value);
    setSelUid(`${kind}-${value}-${Date.now()}`);
    setChosen(sel);
  }

  function pickCustom() {
    const n = parseInt(customVal, 10);
    if (!n || n < 1) return;
    const v = Math.min(n, unitWords);
    saveQuantity(grade, semester, unit, "custom", v);
    setChosen({ kind: "custom", value: v });
  }

  function go() {
    if (!onStart) return;
    const sel = chosen || (last ? { kind: last.kind, value: last.value } : null);
    onStart(sel);
  }

  return (
    <div className="bs-qpick">
      <div className="bs-pick">
        {opts.map((o) => {
          const isOn =
            o.kind === "custom"
              ? active && active.kind === "custom"
              : active && active.kind === o.kind && active.value === o.n;
          return (
            <button
              key={o.kind + (o.n ?? "x")}
              className={"bs-pick-chip" + (isOn ? " on" : "") + (o.kind === "custom" ? " cust" : "")}
              onClick={() => {
                if (o.kind === "custom") {
                  setCustomOpen(true);
                } else {
                  setCustomOpen(false);
                  pick(o.kind, o.n);
                }
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {customOpen && (
        <div className="bs-pick-custom">
          <input
            type="number"
            min="1"
            max={unitWords}
            placeholder={`1–${unitWords}`}
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pickCustom()}
            autoFocus
          />
          <button onClick={pickCustom}>确定</button>
        </div>
      )}

      <div className="bs-pick-note">
        点一下就开始，不再经过设置屏。「自定义」可填 1–{unitWords}。
        <b>选择会记住</b>——下次进来还是上次那个数。
      </div>

      {onStart && (
        <button
          className="bs-pick-go"
          disabled={unitWords === 0 || (active && active.kind === "custom" && !chosen)}
          onClick={go}
        >
          {active ? (
            (() => {
              const r = resolveQuantity(active, { unitWords, left });
              return `开始背 ${r.label} →`;
            })()
          ) : (
            "选一个数量开始 →"
          )}        </button>
      )}
    </div>
  );
}