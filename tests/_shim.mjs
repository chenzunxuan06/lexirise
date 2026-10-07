// web/tests/_shim.mjs —— 给 Node 测试环境补一个 localStorage
// lib/memory.js 把状态存在 localStorage 里；Node 里没有这个全局。
// 打上这个 shim 之后，【不用改任何产品代码】就能直接驱动真实算法。
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
export default store;
