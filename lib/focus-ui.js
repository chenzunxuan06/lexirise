// ============================================================
// lib/focus-ui.js —— 纸间专注的开关（极小的订阅式状态）
// ------------------------------------------------------------
// 为什么不直接用 React state + props 往下传：
//   入口在书签条（BookShell），而覆盖层必须渲染在**书壳之外**才盖得住全屏
//   （书壳里有 bs-rise 动画，动画期间 transform 会成为 position:fixed 的包含块）。
//   两者不在同一棵子树里，用 props 传要穿好几层，还会把 BookShell 和 ShellHost 绑死。
//
// 为什么不用 createPortal 就完事：
//   portal 解决"渲染在哪"，解决不了"谁来触发"。这里要的是后者。
//
// 做法和项目里既有的 sync / game 一致：模块级状态 + 订阅。
// ============================================================

let open = false;
const listeners = new Set();

/** 订阅开关变化；返回退订函数 */
export function onFocusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(open);
    } catch {
      /* 订阅方出错不影响别人 */
    }
  });
}

export function isFocusOpen() {
  return open;
}

export function openFocus() {
  if (open) return;
  open = true;
  notify();
}

export function closeFocus() {
  if (!open) return;
  open = false;
  notify();
}

export default { onFocusChange, isFocusOpen, openFocus, closeFocus };
