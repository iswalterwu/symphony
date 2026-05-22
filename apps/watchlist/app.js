"use strict";

const STORAGE_KEY = "isw-11.watchlist.v1";
const REFRESH_MS = 30000;

const SEED_STOCKS = {
  // A-share (CN) examples
  "600519.SH": { code: "600519.SH", name: "贵州茅台", market: "CN", base: 1685.4 },
  "000858.SZ": { code: "000858.SZ", name: "五粮液", market: "CN", base: 138.2 },
  "300750.SZ": { code: "300750.SZ", name: "宁德时代", market: "CN", base: 218.6 },
  "601318.SH": { code: "601318.SH", name: "中国平安", market: "CN", base: 49.8 },
  "601857.SH": { code: "601857.SH", name: "中国石油", market: "CN", base: 8.42 },
  "510300.SH": { code: "510300.SH", name: "沪深300ETF", market: "CN", base: 3.85 },
  "159915.SZ": { code: "159915.SZ", name: "创业板ETF", market: "CN", base: 2.16 },
  "002594.SZ": { code: "002594.SZ", name: "比亚迪", market: "CN", base: 245.1 },
  // US examples
  "AAPL": { code: "AAPL", name: "Apple", market: "US", base: 192.4 },
  "NVDA": { code: "NVDA", name: "NVIDIA", market: "US", base: 1180.7 },
  "TSLA": { code: "TSLA", name: "Tesla", market: "US", base: 251.3 },
  "MSFT": { code: "MSFT", name: "Microsoft", market: "US", base: 421.2 },
  "GOOGL": { code: "GOOGL", name: "Alphabet", market: "US", base: 178.5 },
  "XOM": { code: "XOM", name: "Exxon Mobil", market: "US", base: 119.7 },
  "JPM": { code: "JPM", name: "JPMorgan", market: "US", base: 215.4 },
  "QQQ": { code: "QQQ", name: "Invesco QQQ", market: "US", base: 484.6 }
};

const DEFAULT_STATE = {
  marketScheme: "CN", // CN = 红涨绿跌 / US = 绿涨红跌
  activeTabId: "tab-tech",
  tabs: [
    { id: "tab-tech", name: "科技", stocks: ["AAPL", "NVDA", "MSFT", "300750.SZ", "002594.SZ"] },
    { id: "tab-energy", name: "能源", stocks: ["XOM", "601857.SH"] },
    { id: "tab-finance", name: "金融", stocks: ["JPM", "601318.SH"] },
    { id: "tab-etf", name: "ETF", stocks: ["QQQ", "510300.SH", "159915.SZ"] }
  ],
  // Per-stock live quote snapshot (price + previousClose). Seeded lazily.
  quotes: {}
};

// ===== Storage =====

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (err) {
    console.warn("watchlist: failed to load state, using defaults", err);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== Quote simulation =====

function isMarketOpenNow(now = new Date()) {
  // Simple rule: 9:30-16:00 local time on weekdays.
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

function seedQuotesIfMissing() {
  for (const code of Object.keys(SEED_STOCKS)) {
    if (!state.quotes[code]) {
      const base = SEED_STOCKS[code].base;
      const wobble = (Math.random() - 0.5) * base * 0.02;
      state.quotes[code] = {
        price: round(base + wobble),
        previousClose: base
      };
    }
  }
}

function tickQuotes() {
  // Mock tick: drift each price by up to ~0.5%
  for (const code of Object.keys(state.quotes)) {
    const q = state.quotes[code];
    const drift = (Math.random() - 0.5) * q.previousClose * 0.01;
    q.price = round(q.price + drift);
  }
  state.lastUpdated = Date.now();
  saveState();
}

function round(value) {
  return Math.round(value * 100) / 100;
}

// ===== Color helpers =====
// marketScheme === "CN" → 红涨绿跌; "US" → 绿涨红跌.

function colorClassPair(change) {
  if (Math.abs(change) < 0.0005) {
    return { block: "is-flat", text: "is-flat-text" };
  }
  const upIsRed = state.marketScheme === "CN";
  const direction = change > 0 ? "up" : "down";
  const role = (direction === "up" && upIsRed) || (direction === "down" && !upIsRed) ? "up" : "down";
  return { block: `is-${role}`, text: `is-${role}-text` };
}

// ===== Rendering =====

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === false || v == null) continue;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function render() {
  const root = document.getElementById("watchlist-root");
  root.innerHTML = "";
  root.appendChild(renderPanel());
  renderDetailIfOpen();
}

function renderPanel() {
  const head = el("header", { class: "watchlist__head" }, [
    el("h2", { class: "watchlist__title" }, "自选股"),
    el("div", { class: "watchlist__controls" }, [
      el("span", { class: "last-updated", id: "last-updated" }, formatLastUpdated()),
      renderMarketToggle(),
      el("button", { class: "refresh-btn", type: "button", onClick: () => { tickQuotes(); render(); } }, "刷新")
    ])
  ]);

  return el("section", { class: "watchlist" }, [
    head,
    renderTabBar(),
    renderStockList()
  ]);
}

function renderMarketToggle() {
  const wrap = el("div", { class: "market-toggle", role: "group", "aria-label": "涨跌配色" });
  for (const scheme of ["CN", "US"]) {
    wrap.appendChild(
      el(
        "button",
        {
          class: state.marketScheme === scheme ? "is-active" : "",
          type: "button",
          onClick: () => {
            state.marketScheme = scheme;
            saveState();
            render();
          }
        },
        scheme === "CN" ? "A股 红涨" : "美股 绿涨"
      )
    );
  }
  return wrap;
}

function renderTabBar() {
  const bar = el("div", { class: "tabs", role: "tablist" });
  for (const tab of state.tabs) {
    const isActive = tab.id === state.activeTabId;
    const tabEl = el(
      "div",
      {
        class: `tab${isActive ? " is-active" : ""}`,
        role: "tab",
        dataset: { tabId: tab.id },
        onClick: () => {
          state.activeTabId = tab.id;
          saveState();
          render();
        },
        ondragover: (e) => onTabDragOver(e, tab),
        ondragleave: (e) => e.currentTarget.classList.remove("is-drop-target"),
        ondrop: (e) => onTabDrop(e, tab)
      },
      [
        document.createTextNode(tab.name),
        el("span", { class: "tab__count" }, `(${tab.stocks.length})`),
        el(
          "button",
          {
            class: "tab__menu",
            type: "button",
            "aria-label": "Tab 操作",
            onClick: (e) => {
              e.stopPropagation();
              openTabMenu(e.currentTarget, tab);
            }
          },
          "⋯"
        )
      ]
    );
    bar.appendChild(tabEl);
  }
  bar.appendChild(
    el(
      "button",
      {
        class: "tab-add",
        type: "button",
        "aria-label": "新增分类",
        onClick: () => openTabNamePrompt({ title: "新增分类", value: "", onConfirm: createTab })
      },
      "+"
    )
  );
  return bar;
}

function renderStockList() {
  const tab = activeTab();
  const list = el("div", { class: "stock-list", role: "tabpanel" });

  list.appendChild(
    el("div", { class: "stock-row is-header" }, [
      el("div", {}, "股票名称"),
      el("div", { class: "stock-row__price" }, "最新价"),
      el("div", { class: "stock-row__delta" }, "涨跌额"),
      el("div", { class: "stock-row__pct-cell" }, "涨跌幅")
    ])
  );

  if (!tab || tab.stocks.length === 0) {
    list.appendChild(el("div", { class: "empty-state" }, "暂无股票，拖入或从其他分类添加"));
    return list;
  }

  for (const code of tab.stocks) {
    const meta = SEED_STOCKS[code];
    if (!meta) continue;
    const quote = state.quotes[code];
    const change = quote.price - quote.previousClose;
    const pct = (change / quote.previousClose) * 100;
    const { block } = colorClassPair(change);
    const textClass = block === "is-up" ? "is-up-text" : block === "is-down" ? "is-down-text" : "is-flat-text";
    const sign = change > 0 ? "+" : "";

    const row = el(
      "div",
      {
        class: "stock-row",
        draggable: "true",
        dataset: { code },
        onClick: () => openDetail(code),
        ondragstart: (e) => onRowDragStart(e, code),
        ondragend: (e) => e.currentTarget.classList.remove("is-dragging")
      },
      [
        el("div", { class: "stock-row__name" }, [
          el("span", { class: "stock-row__name-main" }, meta.name),
          el("span", { class: "stock-row__name-sub" }, meta.code)
        ]),
        el("div", { class: `stock-row__price ${textClass}` }, quote.price.toFixed(2)),
        el("div", { class: `stock-row__delta ${textClass}` }, `${sign}${change.toFixed(2)}`),
        el("div", { class: "stock-row__pct-cell" }, el("span", { class: `stock-row__pct ${block}` }, `${sign}${pct.toFixed(2)}%`))
      ]
    );

    list.appendChild(row);
  }

  return list;
}

function formatLastUpdated() {
  if (!state.lastUpdated) return isMarketOpenNow() ? "开盘中" : "休市";
  const d = new Date(state.lastUpdated);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `更新于 ${stamp}${isMarketOpenNow() ? "" : " · 休市"}`;
}

// ===== Tab operations =====

function activeTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
}

function createTab(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const id = `tab-${Date.now()}`;
  state.tabs.push({ id, name: trimmed, stocks: [] });
  state.activeTabId = id;
  saveState();
  render();
}

function renameTab(tab, name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  tab.name = trimmed;
  saveState();
  render();
}

function deleteTab(tab) {
  if (state.tabs.length <= 1) {
    alert("至少保留一个分类");
    return;
  }
  if (!confirm(`删除分类 "${tab.name}"？该分类中的股票也会一并移除。`)) return;
  const idx = state.tabs.findIndex((t) => t.id === tab.id);
  state.tabs.splice(idx, 1);
  if (state.activeTabId === tab.id) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  saveState();
  render();
}

// ===== Tab menu (context-style) =====

let openMenuEl = null;

function closeOpenMenu() {
  if (openMenuEl && openMenuEl.parentNode) openMenuEl.parentNode.removeChild(openMenuEl);
  openMenuEl = null;
  document.removeEventListener("click", closeOpenMenuOnOutside, true);
}

function closeOpenMenuOnOutside(e) {
  if (openMenuEl && !openMenuEl.contains(e.target)) closeOpenMenu();
}

function openTabMenu(anchor, tab) {
  closeOpenMenu();
  const rect = anchor.getBoundingClientRect();
  const menu = el("div", { class: "context-menu" }, [
    el(
      "button",
      {
        type: "button",
        onClick: () => {
          closeOpenMenu();
          openTabNamePrompt({
            title: "重命名分类",
            value: tab.name,
            onConfirm: (name) => renameTab(tab, name)
          });
        }
      },
      "重命名"
    ),
    el(
      "button",
      {
        type: "button",
        class: "is-danger",
        onClick: () => {
          closeOpenMenu();
          deleteTab(tab);
        }
      },
      "删除"
    )
  ]);
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);
  openMenuEl = menu;
  setTimeout(() => document.addEventListener("click", closeOpenMenuOnOutside, true), 0);
}

// ===== Modal prompt =====

function openTabNamePrompt({ title, value, onConfirm }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = "";
  const input = el("input", { type: "text", value, maxlength: "24", placeholder: "分类名称" });
  const close = () => (root.innerHTML = "");
  const confirm = () => {
    onConfirm(input.value);
    close();
  };
  const modal = el("div", { class: "modal-backdrop" }, [
    el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [
      el("h3", {}, title),
      input,
      el("div", { class: "modal__buttons" }, [
        el("button", { type: "button", onClick: close }, "取消"),
        el("button", { type: "button", class: "is-primary", onClick: confirm }, "确定")
      ])
    ])
  ]);
  root.appendChild(modal);
  input.focus();
  input.select();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    else if (e.key === "Escape") close();
  });
}

// ===== Drag-and-drop =====

let draggedCode = null;
let draggedFromTabId = null;

function onRowDragStart(e, code) {
  draggedCode = code;
  draggedFromTabId = state.activeTabId;
  e.currentTarget.classList.add("is-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", code);
}

function onTabDragOver(e, tab) {
  if (!draggedCode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("is-drop-target");
}

function onTabDrop(e, targetTab) {
  e.preventDefault();
  e.currentTarget.classList.remove("is-drop-target");
  if (!draggedCode) return;
  if (targetTab.id === draggedFromTabId) {
    draggedCode = null;
    return;
  }
  const src = state.tabs.find((t) => t.id === draggedFromTabId);
  if (src) {
    const idx = src.stocks.indexOf(draggedCode);
    if (idx >= 0) src.stocks.splice(idx, 1);
  }
  if (!targetTab.stocks.includes(draggedCode)) {
    targetTab.stocks.push(draggedCode);
  }
  draggedCode = null;
  draggedFromTabId = null;
  saveState();
  render();
}

// ===== Detail side panel =====

let detailCode = null;

function openDetail(code) {
  detailCode = code;
  renderDetailIfOpen();
}

function closeDetail() {
  detailCode = null;
  const panel = document.getElementById("detail-panel");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

function renderDetailIfOpen() {
  const panel = document.getElementById("detail-panel");
  const body = panel.querySelector(".detail-panel__body");
  if (!detailCode) {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    return;
  }
  const meta = SEED_STOCKS[detailCode];
  const quote = state.quotes[detailCode];
  if (!meta || !quote) return;
  const change = quote.price - quote.previousClose;
  const pct = (change / quote.previousClose) * 100;
  const { block, text } = colorClassPair(change);
  const sign = change > 0 ? "+" : "";

  body.innerHTML = "";
  body.appendChild(el("h2", { class: "detail-card__name" }, meta.name));
  body.appendChild(el("div", { class: "detail-card__code" }, `${meta.code} · ${meta.market === "CN" ? "A股" : "美股"}`));
  body.appendChild(el("div", { class: `detail-card__price ${text}` }, quote.price.toFixed(2)));
  body.appendChild(
    el("div", { class: "detail-card__delta-row" }, [
      el("span", { class: `stock-row__pct ${block}` }, `${sign}${change.toFixed(2)}`),
      el("span", { class: `stock-row__pct ${block}` }, `${sign}${pct.toFixed(2)}%`)
    ])
  );
  body.appendChild(renderStatsGrid(meta, quote));
  body.appendChild(renderSparkline(quote));

  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function renderStatsGrid(meta, quote) {
  const grid = el("div", { class: "detail-card__stats" });
  const rows = [
    ["昨收", quote.previousClose.toFixed(2)],
    ["今开", (quote.previousClose * (1 + (Math.random() - 0.5) * 0.005)).toFixed(2)],
    ["最高", Math.max(quote.price, quote.previousClose * 1.008).toFixed(2)],
    ["最低", Math.min(quote.price, quote.previousClose * 0.992).toFixed(2)],
    ["市场", meta.market === "CN" ? "A股" : "美股"],
    ["更新", state.lastUpdated ? new Date(state.lastUpdated).toLocaleTimeString() : "—"]
  ];
  for (const [label, value] of rows) {
    grid.appendChild(el("div", { class: "detail-card__stat-label" }, label));
    grid.appendChild(el("div", { class: "detail-card__stat-value" }, value));
  }
  return grid;
}

function renderSparkline(quote) {
  const w = 320;
  const h = 80;
  const points = [];
  let p = quote.previousClose;
  for (let i = 0; i < 24; i++) {
    p = p + (Math.random() - 0.5) * quote.previousClose * 0.005;
    points.push(p);
  }
  points.push(quote.price);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const coords = points
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "detail-card__sparkline");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const change = quote.price - quote.previousClose;
  const { block } = colorClassPair(change);
  const stroke = block === "is-up" ? "var(--up)" : block === "is-down" ? "var(--down)" : "var(--flat)";
  const path = document.createElementNS(svgNS, "polyline");
  path.setAttribute("points", coords);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", "1.5");
  svg.appendChild(path);
  return svg;
}

// ===== Bootstrap =====

let state = loadState();
seedQuotesIfMissing();
if (!state.lastUpdated) {
  state.lastUpdated = Date.now();
  saveState();
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  document
    .querySelector("#detail-panel .detail-panel__close")
    .addEventListener("click", closeDetail);

  setInterval(() => {
    if (!isMarketOpenNow()) {
      const lu = document.getElementById("last-updated");
      if (lu) lu.textContent = formatLastUpdated();
      return;
    }
    tickQuotes();
    render();
  }, REFRESH_MS);
});

// Expose minimal API for manual smoke tests in DevTools.
window.__watchlist = {
  state,
  tick: tickQuotes,
  render,
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    seedQuotesIfMissing();
    render();
  }
};
