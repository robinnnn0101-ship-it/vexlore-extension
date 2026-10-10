const BOT = "vexlorebot";
const FREE_LIMIT = 500;
const LOCKED_FEATURES = ["bundle", "holders", "dev", "lore"];
const ST_CACHE_MS = 75 * 1000;

const CHAINS = {
  sol:  { id: "solana",    label: "Solana",    gecko: "solana" },
  rh:   { id: "robinhood", label: "Robinhood", gecko: "robinhood" },
  arc:  { id: "arc",       label: "Arc",       gecko: "arc" },
  eth:  { id: "ethereum",  label: "ETH",       gecko: "eth" },
  bnb:  { id: "bsc",       label: "BNB",       gecko: "bsc" },
  base: { id: "base",      label: "Base",      gecko: "base" },
  hype: { id: "hyperevm",  label: "HyperEVM",  gecko: "hyperevm" },
};

const out = document.getElementById("out");
const input = document.getElementById("q");
const mediaEl = document.getElementById("media");
const bannerEl = document.getElementById("banner");
const tokenImgEl = document.getElementById("tokenImg");
const tokenNameEl = document.getElementById("tokenName");
const tokenSymEl = document.getElementById("tokenSym");
const clipHint = document.getElementById("clipHint");

let settings = { stKey: "", ghToken: "", autoScan: true, xSearchOnClick: true };
let lastClip = "";
let lastScan = { ca: "", chain: "", name: "", symbol: "" };
const stCache = new Map();
const stInflight = new Map();

/* ───────── helpers ───────── */
function isCa(t) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(t || "").trim()); }
function isEvmCa(t) { return /^0x[a-fA-F0-9]{40}$/.test(String(t || "").trim()); }
function extractCa(text) {
  const m = String(text || "").match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return m ? m[0] : "";
}
function extractEvmCa(text) {
  const m = String(text || "").match(/0x[a-fA-F0-9]{40}/i);
  return m ? m[0] : "";
}
function extractAnyCa(text) {
  const evm = extractEvmCa(text);
  if (isEvmCa(evm)) return { chain: "evm", ca: evm };
  const sol = extractCa(text);
  if (isCa(sol)) return { chain: "sol", ca: sol };
  return { chain: "", ca: "" };
}
function extractGithub(text) {
  const raw = String(text || "");
  const m = raw.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/i);
  if (m) return { owner: m[1], repo: (m[2] || "").replace(/\.git$/i, "") };
  const slash = raw.match(/^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*$/);
  if (slash) return { owner: slash[1], repo: slash[2].replace(/\.git$/i, "") };
  return null;
}
function num(n) { const x = Number(n); return Number.isFinite(x) && x > 0 ? x : null; }
function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "n/a";
  const sign = x < 0 ? "-" : "";
  const a = Math.abs(x);
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(2) + "K";
  return sign + "$" + a.toFixed(2);
}
function moneyMkt(n) { const x = num(n); return x == null ? "n/a" : money(x); }
function pct(n) { const x = Number(n); return Number.isFinite(x) ? x.toFixed(2) + "%" : "n/a"; }
function short(a) {
  a = String(a || "");
  if (a.startsWith("0x") && a.length >= 10) return a.slice(0, 6) + "…" + a.slice(-4);
  return a.slice(0, 4) + "…" + a.slice(-4);
}
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function sameTicker(a, b) { return !!(norm(a) && norm(a) === norm(b)); }
function toDate(n) {
  if (n == null || n === "") return null;
  if (typeof n === "string" && n.includes("-") && n.length >= 8) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return new Date(x < 1e11 ? x * 1000 : x);
}
function utc(d) {
  if (!d || Number.isNaN(d.getTime())) return "unknown";
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " UTC";
}
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ───────── Usage & Key ───────── */
async function getUsage() {
  const data = await chrome.storage.local.get(["usageMonth", "usageCount"]);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (data.usageMonth !== currentMonth) {
    await chrome.storage.local.set({ usageMonth: currentMonth, usageCount: 0 });
    return { month: currentMonth, count: 0 };
  }
  return { month: data.usageMonth, count: data.usageCount || 0 };
}
async function incrementUsage() {
  const usage = await getUsage();
  await chrome.storage.local.set({ usageCount: usage.count + 1 });
  return usage.count + 1;
}
async function hasValidKey() {
  return !!(settings.stKey && settings.stKey.trim().length > 8);
}
async function updateUsageBar() {
  const bar = document.getElementById("usageBar");
  if (!bar) return;
  if (await hasValidKey()) {
    bar.innerHTML = `✅ <b>Unlimited</b> • Vexlore Key active`;
    bar.style.color = "var(--ok)";
    document.querySelectorAll(".chip.locked").forEach((c) => {
      c.classList.remove("locked");
      c.textContent = c.textContent.replace("🔒 ", "");
    });
  } else {
    const usage = await getUsage();
    const left = Math.max(0, FREE_LIMIT - usage.count);
    bar.innerHTML = `Free searches left this month: <b>${left}</b> / ${FREE_LIMIT}`;
    bar.style.color = left <= 20 ? "var(--warn)" : "var(--muted)";
  }
}
function showUpgradeMessage(reason = "limit") {
  const msg = reason === "locked"
    ? `🔒 This is a premium feature.<br><br>Unlock <b>Bundle</b>, <b>Holders</b>, <b>Dev</b> & <b>Lore</b> + Unlimited searches with a <b>Vexlore Special Key</b>.`
    : `😢 You have used all <b>500 free searches</b> this month.<br><br>Get unlimited access with a <b>Vexlore Special Key</b>.`;
  out.innerHTML = `<div class="card"><h3>🔑 Upgrade needed</h3><div class="body">${msg}<br><br>Get your key here:<br><a href="https://t.me/VEXLOREAPI" target="_blank" style="color:var(--pink-soft);font-weight:700;">→ t.me/VEXLOREAPI</a><br><br><span class="muted">All features stay free on Telegram @${BOT}</span></div></div>`;
  hideMedia();
}

/* ───────── UI helpers ───────── */
function showPanel(name) {
  document.getElementById("panelMain").classList.toggle("show", name === "main");
  document.getElementById("panelHistory").classList.toggle("show", name === "history");
  document.getElementById("panelSettings").classList.toggle("show", name === "settings");
}
function setLoading() {
  hideMedia();
  out.innerHTML = `<div class="loading"><div class="spinner"></div>Scanning with love…</div>`;
}
function showErr(e) {
  hideMedia();
  out.innerHTML = `<div class="err-box">Error: ${esc(e && e.message ? e.message : e)}</div>`;
}
function hideMedia() {
  mediaEl.classList.remove("show");
  bannerEl.removeAttribute("src");
  tokenImgEl.removeAttribute("src");
}
function showMedia({ image, banner, name, symbol }) {
  if (!image && !banner) { hideMedia(); return; }
  mediaEl.classList.add("show");
  if (banner) {
    bannerEl.style.display = "block";
    bannerEl.src = banner;
    bannerEl.onerror = () => { bannerEl.style.display = "none"; };
  } else bannerEl.style.display = "none";
  if (image) {
    tokenImgEl.src = image;
    tokenImgEl.onerror = () => { tokenImgEl.style.opacity = "0.3"; };
    tokenImgEl.style.opacity = "1";
  }
  tokenNameEl.textContent = name || "Unknown";
  tokenSymEl.textContent = symbol ? `$${symbol}` : "—";
}
function dexCdnImage(ca, chain) {
  if (isEvmCa(ca)) return `https://dd.dexscreener.com/ds-data/tokens/${chain || "ethereum"}/${String(ca).toLowerCase()}.png`;
  return `https://dd.dexscreener.com/ds-data/tokens/solana/${ca}.png`;
}
function dexCdnBanner(ca, chain) {
  if (isEvmCa(ca)) return `https://dd.dexscreener.com/ds-data/tokens/${chain || "ethereum"}/${String(ca).toLowerCase()}/header.png`;
  return `https://dd.dexscreener.com/ds-data/tokens/solana/${ca}/header.png`;
}
function firstHttpUrl(...vals) {
  for (const v of vals) {
    const s = String(v || "").trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return "";
}
function pairDexMedia(pair) {
  const info = pair && pair.info;
  return {
    image: firstHttpUrl(info && info.imageUrl, info && info.image, pair && pair.imageUrl),
    banner: firstHttpUrl(info && info.header, info && info.openGraph, info && info.banner),
  };
}

/* ───────── X Search (CSP-safe: no inline onclick) ───────── */
function resolveSearchCa(raw) {
  const ca = String(raw || "").trim();
  if (!ca) return "";
  // Prefer full CA from last scan when the UI shows a shortened form
  const full = String(lastScan.ca || "").trim();
  if (full) {
    if (ca === full) return full;
    // short forms: "Abcd…Wxyz" or "0xAbcd…Wxyz"
    if (ca.includes("…") || ca.includes("...")) {
      const parts = ca.replace(/\.\.\./g, "…").split("…");
      if (parts.length === 2) {
        const a = parts[0], b = parts[1];
        if (full.startsWith(a) && full.endsWith(b)) return full;
      }
    }
  }
  // Only open X for real-looking addresses
  if (isCa(ca) || isEvmCa(ca)) return ca;
  return ca; // still allow exact pasted strings
}

function openXSearches(rawCa) {
  if (settings.xSearchOnClick === false) {
    console.warn("[VEXLORE] X search disabled in Settings — enable it in ⚙️");
    return;
  }
  const ca = resolveSearchCa(rawCa);
  if (!ca) return;

  const symbol = lastScan.symbol || "";
  const q1 = encodeURIComponent(ca);
  const q2 = symbol
    ? encodeURIComponent("$" + String(symbol).replace(/^\$/, ""))
    : encodeURIComponent(ca);
  const q3 = encodeURIComponent(ca + " news");

  const urls = [
    "https://x.com/search?q=" + q1 + "&src=typed_query",
    "https://x.com/search?q=" + q2 + "&src=typed_query",
    "https://x.com/search?q=" + q3 + "&src=typed_query",
  ];

  // Prefer background service worker (reliable in MV3 side panel)
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "OPEN_X_SEARCH", urls }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          // fallback: open from this context
          for (const url of urls) {
            try {
              if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
              else window.open(url, "_blank");
            } catch (_) {
              try { window.open(url, "_blank"); } catch (__) {}
            }
          }
        }
      });
      return;
    }
  } catch (_) {}

  for (const url of urls) {
    try {
      if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
      else window.open(url, "_blank");
    } catch (_) {
      try { window.open(url, "_blank"); } catch (__) {}
    }
  }
}

window.vexloreOpenX = openXSearches;

// Mark CA spans with data-ca (inline onclick is blocked by extension CSP)
function makeCaClickable(html) {
  // Match class="ca" and class='ca'
  return String(html || "").replace(
    /<span\s+class=["']ca["']([^>]*)>([^<]*)<\/span>/gi,
    (match, attrs, ca) => {
      if (/\bdata-ca\s*=/.test(attrs)) {
        return `<span class="ca"${attrs} title="Click to open X searches">${ca}</span>`;
      }
      const safe = String(ca).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return `<span class="ca" data-ca="${safe}" title="Click to open X searches">${ca}</span>`;
    }
  );
}

function renderCards(cards) {
  out.innerHTML = cards.map((c) => `
    <div class="card">
      <h3>${c.icon || "✦"} ${esc(c.title)}</h3>
      <div class="body">${makeCaClickable(c.html)}</div>
    </div>`).join("");
}

// Event delegation — works even when cards are re-rendered
if (!window.__vexloreCaClickBound) {
  window.__vexloreCaClickBound = true;
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!t) return;
      // walk up a few levels for nested nodes inside .ca
      let el = t;
      for (let i = 0; i < 4 && el; i++) {
        if (el.classList && el.classList.contains("ca") && el.getAttribute) {
          const ca = el.getAttribute("data-ca") || el.textContent;
          if (ca && String(ca).trim()) {
            e.preventDefault();
            openXSearches(String(ca).trim());
            return;
          }
        }
        el = el.parentElement;
      }
    },
    true
  );
}


/* ───────── storage ───────── */
async function loadSettings() {
  const data = await chrome.storage.local.get(["stKey", "ghToken", "autoScan", "xSearchOnClick"]);
  settings.stKey = data.stKey || "";
  settings.ghToken = data.ghToken || "";
  settings.autoScan = data.autoScan !== false;
  settings.xSearchOnClick = data.xSearchOnClick !== false;

  document.getElementById("stKey").value = settings.stKey;
  document.getElementById("ghToken").value = settings.ghToken;
  document.getElementById("autoScan").checked = settings.autoScan;
  const xToggle = document.getElementById("xSearchOnClick");
  if (xToggle) xToggle.checked = settings.xSearchOnClick;
}
async function saveSettings() {
  settings.stKey = document.getElementById("stKey").value.trim();
  settings.ghToken = document.getElementById("ghToken").value.trim();
  settings.autoScan = document.getElementById("autoScan").checked;
  const xToggle = document.getElementById("xSearchOnClick");
  settings.xSearchOnClick = xToggle ? xToggle.checked : true;

  await chrome.storage.local.set({
    stKey: settings.stKey,
    ghToken: settings.ghToken,
    autoScan: settings.autoScan,
    xSearchOnClick: settings.xSearchOnClick,
  });

  clipHint.textContent = settings.autoScan
    ? "Copy a CA → it auto-pastes & scans"
    : "Copy a CA → it auto-pastes (scan off)";
  await updateUsageBar();
  showPanel("main");
}
async function pushHistory(entry) {
  const data = await chrome.storage.local.get(["history"]);
  let list = Array.isArray(data.history) ? data.history : [];
  list = list.filter((x) => x.ca !== entry.ca);
  list.unshift({ ...entry, at: Date.now() });
  list = list.slice(0, 20);
  await chrome.storage.local.set({ history: list });
}
async function renderHistory() {
  const data = await chrome.storage.local.get(["history"]);
  const list = Array.isArray(data.history) ? data.history : [];
  const el = document.getElementById("historyList");
  if (!list.length) {
    el.innerHTML = `<div class="muted" style="font-size:12px;padding:8px 0;">No scans yet ✨</div>`;
    return;
  }
  el.innerHTML = list.map((h) => `
    <div class="history-item" data-ca="${esc(h.ca)}">
      <img src="${esc(h.image || dexCdnImage(h.ca, h.chain))}" alt="" onerror="this.style.opacity=0.3" />
      <div class="h-meta">
        <div class="h-name">${esc(h.name || "Token")} ${h.symbol ? "(" + esc(h.symbol) + ")" : ""}</div>
        <div class="h-ca">${esc(short(h.ca))} · ${esc(h.chain || "?")}</div>
      </div>
    </div>`).join("");
  el.querySelectorAll(".history-item").forEach((node) => {
    node.onclick = () => {
      input.value = node.getAttribute("data-ca");
      showPanel("main");
      run("scan");
    };
  });
}

/* ───────── network ───────── */
async function jget(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VEXLORE-Extension", ...headers },
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}
async function st(path) {
  if (!(await hasValidKey())) return null;
  const key = settings.stKey.trim();
  const hit = stCache.get(path);
  if (hit && Date.now() - hit.at < ST_CACHE_MS) return hit.data;
  if (stInflight.has(path)) return stInflight.get(path);
  const job = (async () => {
    const r = await jget("https://data.solanatracker.io" + path, { "x-api-key": key });
    const data = r.ok ? r.data : null;
    stCache.set(path, { at: Date.now(), data });
    return data;
  })();
  stInflight.set(path, job);
  try { return await job; } finally { stInflight.delete(path); }
}

function extractPairs(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.pairs)) return data.pairs;
  if (data && data.pair && typeof data.pair === "object") return [data.pair];
  return [];
}
function pairLiq(p) { return num(p && p.liquidity && (p.liquidity.usd ?? p.liquidity)); }
function pairMc(p) { return num(p && p.marketCap) || num(p && p.fdv); }
function pairVol(p) { return num(p && p.volume && (p.volume.h24 ?? p.volume.usd)); }
function pairHasMarket(p) { return !!(pairLiq(p) || pairMc(p)); }
function pairScore(p) {
  const liq = pairLiq(p) || 0, mc = pairMc(p) || 0, vol = pairVol(p) || 0;
  let score = liq + vol * 0.01;
  if (liq > 0 && mc > 0) score += 1e15;
  else if (liq > 0 || mc > 0) score += 1e12;
  return score;
}
function pickBestPair(pairs) {
  const list = (Array.isArray(pairs) ? pairs : []).filter(Boolean);
  if (!list.length) return null;
  const good = list.filter(pairHasMarket);
  const pool = good.length ? good : list;
  pool.sort((a, b) => pairScore(b) - pairScore(a));
  return pool[0] || null;
}

async function detectChainAndPair(ca) {
  if (isCa(ca) && !isEvmCa(ca)) {
    const pair = await dexSolPair(ca);
    return { chain: "sol", pair, label: "Solana" };
  }
  const r = await jget("https://api.dexscreener.com/latest/dex/tokens/" + ca);
  const pairs = extractPairs(r.data);
  if (!pairs.length) return { chain: "unknown", pair: null, label: "Unknown" };

  const byChain = {};
  for (const p of pairs) {
    const cid = String(p.chainId || "").toLowerCase();
    let key = "unknown";
    if (cid === "solana") key = "sol";
    else if (["robinhood", "robinhoodchain"].includes(cid) || cid === "4663") key = "rh";
    else if (cid === "arc" || cid === "5042") key = "arc";
    else if (["ethereum", "eth"].includes(cid) || cid === "1") key = "eth";
    else if (["bsc", "bnb"].includes(cid) || cid === "56") key = "bnb";
    else if (cid === "base" || cid === "8453") key = "base";
    else if (["hyperevm", "hyperliquid", "hype"].includes(cid) || cid === "999") key = "hype";
    if (!byChain[key]) byChain[key] = [];
    byChain[key].push(p);
  }

  let bestKey = "unknown", bestScore = -1, bestPair = null;
  for (const [k, list] of Object.entries(byChain)) {
    const p = pickBestPair(list);
    const sc = pairScore(p);
    if (sc > bestScore) {
      bestScore = sc;
      bestKey = k;
      bestPair = p;
    }
  }
  return {
    chain: bestKey,
    pair: bestPair,
    label: (CHAINS[bestKey] && CHAINS[bestKey].label) || bestKey,
  };
}

async function dexSolPair(ca) {
  const urls = [
    "https://api.dexscreener.com/tokens/v1/solana/" + ca,
    "https://api.dexscreener.com/latest/dex/tokens/" + ca,
  ];
  let all = [];
  for (const u of urls) {
    const r = await jget(u);
    const next = extractPairs(r.data).filter((p) => !p.chainId || String(p.chainId).toLowerCase() === "solana");
    all = all.concat(next);
  }
  return pickBestPair(all);
}
async function dexSearch(q) {
  if (!q) return [];
  const r = await jget("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q));
  return (r.data && r.data.pairs) || [];
}
async function pumpCoin(ca) {
  if (isEvmCa(ca)) return null;
  const r = await jget("https://frontend-api-v3.pump.fun/coins/" + ca);
  if (!r.ok || !r.data || !r.data.mint) return null;
  return r.data;
}
async function geckoToken(network, ca) {
  const r = await jget(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${String(ca).toLowerCase()}`);
  return r.ok && r.data && r.data.data ? r.data.data : null;
}

function marketQuote(pump, pair, tokenInfo) {
  const st = tokenInfo && (tokenInfo.token || tokenInfo);
  return {
    name: (pump && pump.name) || (pair && pair.baseToken && pair.baseToken.name) || (st && st.name) || "Unknown",
    symbol: (pump && pump.symbol) || (pair && pair.baseToken && pair.baseToken.symbol) || (st && st.symbol) || "?",
    price: num(pair && pair.priceUsd) || num(pump && pump.usd_price) || num(st && st.priceUsd),
    mc: pairMc(pair) || num(pump && (pump.usd_market_cap || pump.market_cap)) || num(st && (st.marketCap || st.mc)),
    fdv: num(pair && pair.fdv) || num(st && st.fdv),
    liq: pairLiq(pair) || num(st && st.liquidity),
    vol: pairVol(pair) || num(st && (st.volume24h || st.volume)),
    url: (pair && pair.url) || "",
  };
}
function geckoMc(tok) {
  const a = tok && tok.attributes;
  if (!a) return {};
  return {
    name: a.name, symbol: a.symbol,
    price: num(a.price_usd),
    mc: num(a.market_cap_usd) || num(a.fdv_usd),
    fdv: num(a.fdv_usd),
    vol: num(a.volume_usd && (a.volume_usd.h24 || a.volume_usd)),
  };
}

function upsert(map, mint, row) {
  if (!mint) return;
  const key = String(mint).toLowerCase();
  const old = map.get(key) || {};
  const created = row.created || old.created || null;
  const oldCreated = old.created || null;
  const better = created && oldCreated
    ? (created.getTime() < oldCreated.getTime() ? created : oldCreated)
    : (created || oldCreated);
  map.set(key, {
    mint: row.mint || mint,
    name: row.name || old.name || "",
    symbol: row.symbol || old.symbol || "",
    created: better,
    mc: row.mc != null ? row.mc : old.mc,
    url: row.url || old.url || "",
  });
}
async function findFamily(ca, pair, chainKey) {
  const name = (pair && pair.baseToken && pair.baseToken.name) || "";
  const symbol = (pair && pair.baseToken && pair.baseToken.symbol) || "";
  const map = new Map();
  upsert(map, ca, {
    mint: ca, name, symbol,
    created: toDate(pair && pair.pairCreatedAt),
    mc: pairMc(pair), url: pair && pair.url,
  });
  const queries = [...new Set([symbol, name].filter(Boolean))];
  for (const q of queries) {
    const pairs = await dexSearch(q);
    for (const p of pairs) {
      const cid = String(p.chainId || "").toLowerCase();
      let match = false;
      if (chainKey === "sol" && (!cid || cid === "solana")) match = true;
      else if (chainKey === "rh" && (["robinhood", "robinhoodchain"].includes(cid) || cid === "4663")) match = true;
      else if (chainKey === "arc" && (cid === "arc" || cid === "5042")) match = true;
      else if (chainKey === "eth" && (["ethereum", "eth"].includes(cid) || cid === "1")) match = true;
      else if (chainKey === "bnb" && (["bsc", "bnb"].includes(cid) || cid === "56")) match = true;
      else if (chainKey === "base" && (cid === "base" || cid === "8453")) match = true;
      else if (chainKey === "hype" && (["hyperevm", "hyperliquid", "hype"].includes(cid) || cid === "999")) match = true;
      if (!match) continue;
      const bn = p.baseToken && p.baseToken.name;
      const bs = p.baseToken && p.baseToken.symbol;
      const mint = p.baseToken && p.baseToken.address;
      if (!mint || (!sameTicker(bs, symbol) && !sameTicker(bn, name))) continue;
      upsert(map, mint, {
        mint, name: bn, symbol: bs,
        created: toDate(p.pairCreatedAt), mc: pairMc(p), url: p.url,
      });
    }
  }
  const all = [...map.values()].sort((a, b) => {
    const ta = a.created ? a.created.getTime() : Infinity;
    const tb = b.created ? b.created.getTime() : Infinity;
    return ta - tb;
  });
  const dated = all.filter((x) => x.created);
  const og = dated[0] || all[0] || null;
  const you = all.find((x) => String(x.mint).toLowerCase() === String(ca).toLowerCase()) || null;
  const isOg = !!(og && you && String(og.mint).toLowerCase() === String(you.mint).toLowerCase());
  return { all, og, you, isOg, name, symbol };
}
function ogLine(fam) {
  if (!fam.og) return "OG unknown (no created time)";
  if (fam.isOg) {
    return `🟢 THIS CA IS OG\nOG: ${fam.og.name || ""} (${fam.og.symbol || ""})\n${fam.og.mint}\n🕐 ${utc(fam.og.created)}`;
  }
  return `🟣 THIS CA IS VAMP\n🟢 OG: ${fam.og.name || ""} (${fam.og.symbol || ""})\n${fam.og.mint}\n🕐 OG ${utc(fam.og.created)}\n🕐 This ${utc(fam.you && fam.you.created)}`;
}

function tokenRisk(tokenInfo) {
  const t = (tokenInfo && (tokenInfo.token || tokenInfo)) || {};
  const risk = t.risk || t.risks || {};
  return {
    snipers: risk.snipers || risk.sniper || {},
    insiders: risk.insiders || risk.insider || {},
  };
}
function parseBundlers(bundlers) {
  const list = Array.isArray(bundlers)
    ? bundlers
    : (bundlers && (bundlers.wallets || bundlers.bundlers || bundlers.data)) || [];
  const wallets = (Array.isArray(list) ? list : []).map((w) => ({
    wallet: w.wallet || w.address || w.owner || "",
    percentage: Number(w.percentage || w.pct || w.hold || 0),
    initialPercentage: Number(w.initialPercentage || w.initial || w.launchPct || 0),
    bundleTime: w.bundleTime || w.time || w.timestamp || null,
  })).filter((w) => w.wallet);
  const nowPct = wallets.reduce((s, w) => s + (w.percentage || 0), 0);
  const initPct = wallets.reduce((s, w) => s + (w.initialPercentage || 0), 0);
  return { wallets, nowPct, initPct, totalW: wallets.length };
}
function clusterKey(w) {
  const t = toDate(w.bundleTime);
  return t ? String(Math.floor(t.getTime() / 1000)) : "unknown";
}

/* ───────── FIXED Holders parser ───────── */
function parseStHolders(data) {
  // Solana Tracker can return: array, {accounts:[]}, {holders:[]}, {data:[]}, {top_holders:[]}
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.accounts)) list = data.accounts;
  else if (data && Array.isArray(data.holders)) list = data.holders;
  else if (data && Array.isArray(data.top_holders)) list = data.top_holders;
  else if (data && Array.isArray(data.data)) list = data.data;
  else if (data && data.data && Array.isArray(data.data.holders)) list = data.data.holders;
  else if (data && data.data && Array.isArray(data.data.accounts)) list = data.data.accounts;

  return list.map((h) => {
    const addr = h.wallet || h.address || h.account || h.owner || h.pubkey || "";
    const pctn = Number(h.percentage || h.pct || h.percent || h.share || 0);
    const amount = num(h.amount || h.balance || h.uiAmount || h.ui_amount);
    let tag = "SHRIMP";
    const lower = String(addr).toLowerCase();
    if (/dead|burn|11111111/.test(lower)) tag = "BURN";
    else if (pctn >= 5) tag = "WHALE";
    else if (pctn >= 1) tag = "FISH";
    else if (pctn >= 0.2) tag = "CRAB";
    return { addr, pctn, tag, amount };
  }).filter((r) => r.addr).sort((a, b) => b.pctn - a.pctn);
}

/* ───────── Builders ───────── */
async function buildReportCards(ca, chainKey, pair) {
  const isSol = chainKey === "sol";
  const [pump, tokenInfo, gecko] = await Promise.all([
    isSol ? pumpCoin(ca) : null,
    isSol ? st("/tokens/" + ca) : null,
    !isSol && CHAINS[chainKey] ? geckoToken(CHAINS[chainKey].gecko, ca) : null,
  ]);
  const fam = await findFamily(ca, pair, chainKey);
  const q = marketQuote(pump, pair, tokenInfo);
  if (!q.name || q.name === "Unknown") {
    const g = geckoMc(gecko);
    if (g.name) { q.name = g.name; q.symbol = g.symbol || q.symbol; q.mc = q.mc || g.mc; q.price = q.price || g.price; }
  }
  const media = {
    image: pairDexMedia(pair).image || firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca, CHAINS[chainKey]?.id),
    banner: pairDexMedia(pair).banner || dexCdnBanner(ca, CHAINS[chainKey]?.id),
    name: q.name, symbol: q.symbol,
  };
  showMedia(media);
  lastScan = { ca, chain: chainKey, name: q.name, symbol: q.symbol };
  await pushHistory({ ca, name: q.name, symbol: q.symbol, image: media.image, chain: chainKey });

  const ogTag = fam.isOg ? "OG" : fam.all.length <= 1 ? "CHECK" : "VAMP";
  const badge = ogTag === "OG" ? `<span class="badge og">🟢 OG</span>`
    : ogTag === "VAMP" ? `<span class="badge vamp">🟣 VAMP</span>`
    : `<span class="badge check">⚪ CHECK</span>`;

  const risk = tokenRisk(tokenInfo);
  const sniperPct = Number((risk.snipers && (risk.snipers.totalPercentage || risk.snipers.percentage)) || 0);
  const insiderPct = Number((risk.insiders && risk.insiders.totalPercentage) || 0);
  const chainLabel = (CHAINS[chainKey] && CHAINS[chainKey].label) || chainKey;

  return [
    {
      icon: "💎",
      title: `Token · ${chainLabel}`,
      html: `${badge}<b>${esc(q.name)}</b> (${esc(q.symbol)})<br><span class="ca">${esc(ca)}</span>`,
    },
    {
      icon: "💰",
      title: "Market",
      html: `MC ${moneyMkt(q.mc)} · FDV ${moneyMkt(q.fdv)}<br>💧 Liq ${moneyMkt(q.liq)} · 📊 Vol24 ${moneyMkt(q.vol)}${q.price ? "<br>Px " + money(q.price) : ""}${q.url ? `<br><a href="${esc(q.url)}" target="_blank" style="color:var(--cyan)">DexScreener</a>` : ""}`,
    },
    {
      icon: "🕐",
      title: "Launch / OG",
      html: `Pair: ${utc(toDate(pair && pair.pairCreatedAt))}<br><br>${esc(ogLine(fam)).replace(/\n/g, "<br>")}`,
    },
    {
      icon: "🎯",
      title: "Risk snapshot",
      html: isSol
        ? `Snipers ${pct(sniperPct)} · Insiders ${pct(insiderPct)}<br><span class="muted">${(await hasValidKey()) ? "Full bundles & holders unlocked" : "Add Vexlore Key for deep data"}</span>`
        : `<span class="muted">EVM risk data limited · use Telegram @${BOT} for full EVM clusters</span>`,
    },
  ];
}

async function buildVampCards(ca, chainKey, pair) {
  const fam = await findFamily(ca, pair, chainKey);
  const media = {
    image: pairDexMedia(pair).image || dexCdnImage(ca, CHAINS[chainKey]?.id),
    banner: pairDexMedia(pair).banner || dexCdnBanner(ca, CHAINS[chainKey]?.id),
    name: fam.name, symbol: fam.symbol,
  };
  showMedia(media);
  lastScan = { ca, chain: chainKey, name: fam.name, symbol: fam.symbol };

  if (!fam.all.length) {
    return [{ icon: "🧛", title: "Vamp", html: "No family found.<br><span class='ca'>" + esc(ca) + "</span>" }];
  }

  let buzzMint = null, maxMc = 0;
  for (const c of fam.all) {
    const m = num(c.mc) || 0;
    if (m > maxMc) { maxMc = m; buzzMint = c.mint; }
  }

  const lines = fam.all.slice(0, 12).map((c) => {
    const isOg = fam.og && String(c.mint).toLowerCase() === String(fam.og.mint).toLowerCase();
    const you = String(c.mint).toLowerCase() === String(ca).toLowerCase() ? " ← you" : "";
    const buzz = c.mint === buzzMint && maxMc > 0 ? " 🔥 BUZZ" : "";
    return `${isOg ? "🟢 OG" : "🟣 copy"}${buzz} <b>${esc(c.name || "")}</b> (${esc(c.symbol || "")})${you}<br><span class="ca">${esc(c.mint)}</span><br>🕐 ${utc(c.created)}${c.mc ? " · MC " + money(c.mc) : ""}`;
  }).join("<br><br>");

  return [
    {
      icon: "🧛",
      title: `Vamp check · ${(CHAINS[chainKey] && CHAINS[chainKey].label) || chainKey}`,
      html: `Name: ${esc(fam.name)} · Ticker: ${esc(fam.symbol)}<br>Matches: ${fam.all.length}<br><br>${esc(ogLine(fam)).replace(/\n/g, "<br>")}`,
    },
    { icon: "📋", title: "Family", html: lines },
  ];
}

async function buildBundleCards(ca) {
  if (!(await hasValidKey())) return [{ icon: "📦", title: "Bundle", html: "Add Vexlore Special Key for live clusters." }];
  if (isEvmCa(ca)) return [{ icon: "📦", title: "Bundle", html: "Full EVM clusters available on Telegram @vexlorebot.<br>Solana bundles work here with key." }];

  const [pump, pair, bundlers, tokenInfo] = await Promise.all([
    pumpCoin(ca), dexSolPair(ca), st("/tokens/" + ca + "/bundlers"), st("/tokens/" + ca),
  ]);
  const q = marketQuote(pump, pair, tokenInfo);
  showMedia({
    image: pairDexMedia(pair).image || firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca),
    banner: pairDexMedia(pair).banner,
    name: q.name, symbol: q.symbol,
  });
  lastScan = { ca, chain: "sol", name: q.name, symbol: q.symbol };

  const risk = tokenRisk(tokenInfo);
  const parsed = parseBundlers(bundlers);
  const { wallets, nowPct, initPct, totalW } = parsed;
  const sniperPct = Number((risk.snipers && (risk.snipers.totalPercentage || risk.snipers.percentage)) || 0);
  const insiderPct = Number((risk.insiders && risk.insiders.totalPercentage) || 0);

  const groups = new Map();
  for (const w of wallets) {
    const k = clusterKey(w);
    const g = groups.get(k) || { key: k, when: toDate(w.bundleTime), wallets: [], pct: 0, init: 0 };
    g.wallets.push(w);
    g.pct += Number(w.percentage || 0);
    g.init += Number(w.initialPercentage || 0);
    groups.set(k, g);
  }
  const clusters = [...groups.values()].sort((a, b) => b.pct - a.pct);
  const live = clusters.filter((c) => c.pct > 0.0001);
  let heat = "🟢 clean";
  if (nowPct >= 30 || live.some((c) => c.pct >= 15)) heat = "🔴 heavy";
  else if (nowPct >= 15 || live.some((c) => c.pct >= 8)) heat = "🟠 fat";
  else if (nowPct >= 5 || totalW >= 8) heat = "🟡 present";

  const clusterLines = (live.length ? live : clusters).slice(0, 6).map((c, i) => {
    const top = c.wallets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 3)
      .map((w) => short(w.wallet) + " " + pct(w.percentage)).join(" · ");
    return `#${i + 1}  ${c.wallets.length} wallets · now ${pct(c.pct)} · launch ${pct(c.init)}<br>🕐 ${utc(c.when)}<br>${top || "—"}`;
  });

  const topHold = wallets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 8)
    .map((w, i) => `${i + 1}. ${short(w.wallet)}  now ${pct(w.percentage)}  launch ${pct(w.initialPercentage)}`);

  return [
    {
      icon: "📦",
      title: `Bundle / clusters  ${heat}`,
      html: `<b>${esc(q.name)}</b> (${esc(q.symbol)})<br><span class="ca">${esc(ca)}</span><br><br>
⚡ live hold ${pct(nowPct)} · launch ${pct(initPct)}<br>
👛 bundler wallets ${totalW} · clusters ${live.length || clusters.length}<br>
🎯 snipers ${pct(sniperPct)} · insiders ${pct(insiderPct)}`,
    },
    { icon: "🧩", title: "Clusters", html: clusterLines.join("<br><br>") || "no clusters" },
    { icon: "👛", title: "Top bundlers now", html: topHold.join("<br>") || "none" },
  ];
}

async function buildHoldersCards(ca, chainKey) {
  if (!(await hasValidKey()) && chainKey === "sol") {
    return [{ icon: "👛", title: "Holders", html: "Add Vexlore Special Key for live holders." }];
  }
  if (chainKey !== "sol") {
    return [{
      icon: "👛",
      title: "Holders",
      html: `Full EVM holders available on Telegram @${BOT}.<br>Use Solana + Vexlore Key here for deep holder data.`,
    }];
  }

  const [pump, pair, holdersData, tokenInfo] = await Promise.all([
    pumpCoin(ca),
    dexSolPair(ca),
    st("/tokens/" + ca + "/holders"),
    st("/tokens/" + ca),
  ]);

  const q = marketQuote(pump, pair, tokenInfo);
  showMedia({
    image: pairDexMedia(pair).image || firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca),
    name: q.name,
    symbol: q.symbol,
  });
  lastScan = { ca, chain: "sol", name: q.name, symbol: q.symbol };

  const rows = parseStHolders(holdersData);

  if (!rows.length) {
    return [{
      icon: "👛",
      title: "Holders",
      html: `<b>${esc(q.name)}</b> (${esc(q.symbol)})<br><br>No holder data returned from Solana Tracker.<br>Try again in a few seconds or check your key.`,
    }];
  }

  const topConc = rows.slice(0, 10).reduce((s, r) => s + r.pctn, 0);
  const lines = rows.slice(0, 15).map((h, i) =>
    `${i + 1}. ${h.tag} <span class="ca">${esc(short(h.addr))}</span> · ${pct(h.pctn)}`
  );

  return [{
    icon: "👛",
    title: "Holders",
    html: `<b>${esc(q.name)}</b> (${esc(q.symbol)})<br>
Top 10 concentration: <b>${pct(topConc)}</b><br>
Total shown: ${rows.length}<br><br>
${lines.join("<br>")}`,
  }];
}


/* ───────── Callouts helpers (from Telegram bot) ───────── */
function asReplyList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const nested = data.data && typeof data.data === "object" ? data.data : null;
  const list =
    data.replies ||
    data.comments ||
    data.callouts ||
    data.items ||
    data.results ||
    data.list ||
    (nested && (nested.replies || nested.comments || nested.callouts || nested.items || nested.results)) ||
    data.data;
  return Array.isArray(list) ? list : [];
}
function replyWhen(row) {
  if (!row || typeof row !== "object") return null;
  return (
    toDate(
      row.timestamp ||
        row.created_timestamp ||
        row.created_at ||
        row.createdAt ||
        row.time ||
        row.date ||
        row.created ||
        (row.callout && (row.callout.timestamp || row.callout.createdAt || row.callout.calloutTimestamp))
    ) || null
  );
}
function replyUser(row) {
  if (!row || typeof row !== "object") return { name: "", addr: "", twitter: "" };
  const u = row.user && typeof row.user === "object" ? row.user : null;
  const caller = row.caller && typeof row.caller === "object" ? row.caller : null;
  const profile =
    (row.profile && typeof row.profile === "object" && row.profile) ||
    (u && u.profile && typeof u.profile === "object" && u.profile) ||
    null;
  const addr = String(
    (typeof row.user === "string" && row.user) ||
      row.address ||
      row.wallet ||
      row.walletAddress ||
      row.userAddress ||
      row.user_address ||
      row.publicKey ||
      row.public_key ||
      (u && (u.address || u.wallet || u.id || u.publicKey)) ||
      (caller && (caller.address || caller.wallet || caller.id)) ||
      ""
  ).trim();
  const name = String(
    row.username ||
      row.userName ||
      row.handle ||
      row.displayName ||
      row.display_name ||
      (u && (u.username || u.name || u.handle)) ||
      (caller && (caller.username || caller.name || caller.handle)) ||
      row.name ||
      ""
  ).trim();
  const rawTw = String(
    row.twitter ||
      row.twitter_username ||
      row.twitterUsername ||
      row.twitter_handle ||
      row.x ||
      row.x_username ||
      row.xUsername ||
      (u && (u.twitter || u.twitter_username || u.twitterUsername || u.x || u.x_username)) ||
      (caller && (caller.twitter || caller.x || caller.xUsername)) ||
      (profile && (profile.twitter || profile.x || profile.x_username)) ||
      ""
  ).trim();
  let twitter = "";
  if (rawTw) {
    const m = rawTw.match(/(?:(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/)?@?([A-Za-z0-9_]{1,15})/i);
    twitter = m ? m[1] : rawTw.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  }
  return { name, addr, twitter };
}
function replyText(row) {
  if (!row || typeof row !== "object") return "";
  return String(
    row.text ||
      row.comment ||
      row.message ||
      row.content ||
      row.body ||
      row.thesis ||
      row.callout_text ||
      (row.callout && (row.callout.thesis || row.callout.text || row.callout.message || row.callout.comment)) ||
      ""
  ).trim();
}
function replyMc(row) {
  if (!row || typeof row !== "object") return null;
  const nested = row.callout && typeof row.callout === "object" ? row.callout : null;
  return (
    num(row.marketCapUsd) ||
    num(row.market_cap_usd) ||
    num(row.usd_market_cap) ||
    num(row.marketCap) ||
    num(row.mcap) ||
    num(row.calledOutAtMcap) ||
    num(nested && (nested.calledOutAtMcap || nested.marketCapUsd || nested.market_cap)) ||
    null
  );
}
function replyPositionUsd(row) {
  if (!row || typeof row !== "object") return null;
  const p =
    (row.position && typeof row.position === "object" && row.position) ||
    (row.holding && typeof row.holding === "object" && row.holding) ||
    null;
  const cost = num(row.costBasisUsd);
  const pnl = num(row.pnlUsd);
  if (cost != null && pnl != null) return cost + pnl;
  return (
    num(p && (p.valueUsd || p.value_usd || p.usd)) ||
    num(row.valueUsd) ||
    num(row.holding_value_usd) ||
    cost ||
    null
  );
}
function sortCalloutRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
    const ta = a.when ? a.when.getTime() : Infinity;
    const tb = b.when ? b.when.getTime() : Infinity;
    return ta - tb;
  });
}
function walletUsdSize(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "SHRIMP";
  if (x >= 25000) return "WHALE";
  if (x >= 3000) return "FISH";
  if (x >= 500) return "CRAB";
  return "SHRIMP";
}
function walletSizeIcon(tag) {
  if (tag === "WHALE") return "🐳";
  if (tag === "FISH") return "🐟";
  if (tag === "CRAB") return "🦀";
  if (tag === "BOT") return "🤖";
  return "🦐";
}

async function pumpMintCallouts(ca) {
  if (!isCa(ca) || isEvmCa(ca)) return [];
  const urls = [
    "https://frontend-api-v3.pump.fun/mint-positions/" + ca + "?sortBy=TOP&withThesis=true&pageSize=50",
    "https://frontend-api-v3.pump.fun/mint-positions/" + ca + "?sortBy=RECENT&withThesis=true&pageSize=50",
    "https://frontend-api-v3.pump.fun/mint-positions/" + ca + "?sortBy=TOP&pageSize=50",
  ];
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const r = await jget(u);
    const list =
      (r.data && Array.isArray(r.data.positions) && r.data.positions) ||
      (r.data && Array.isArray(r.data) && r.data) ||
      [];
    if (!list.length) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const call = row.callout && typeof row.callout === "object" ? row.callout : null;
      const text = String(
        (call && (call.thesis || call.text || call.message || call.comment)) ||
          row.thesis ||
          row.text ||
          row.comment ||
          row.message ||
          ""
      ).trim();
      const name = String(
        row.userName || row.username || row.handle || (row.user && (row.user.username || row.user.name)) || ""
      ).trim();
      const addr = String(
        row.walletAddress || row.wallet || row.address || row.publicKey ||
        (row.user && (row.user.address || row.user.wallet)) || ""
      ).trim();
      const when = toDate(
        (call && (call.calloutTimestamp || call.timestamp || call.createdAt || call.created_at)) ||
          row.calloutTimestamp || row.timestamp || row.createdAt || row.created_at
      );
      const mc =
        num(call && (call.calledOutAtMcap || call.called_out_at_mcap || call.marketCapUsd)) ||
        num(row.calledOutAtMcap) || null;
      const cost = num(row.costBasisUsd);
      const pnl = num(row.pnlUsd);
      const holdUsd = cost != null && pnl != null ? cost + pnl : cost;
      let twitter = String(row.xUsername || row.x_username || row.twitter || row.twitterUsername || "").trim();
      if (twitter) {
        const m = twitter.match(/(?:(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/)?@?([A-Za-z0-9_]{1,15})/i);
        twitter = m ? m[1] : twitter.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
      }
      if (!call && !text) continue;
      if (!name && !addr && !text) continue;
      const key = String((call && call.calloutId) || row.userId || "") + "|" + addr + "|" + (when ? when.getTime() : "") + "|" + text.slice(0, 48);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name, addr, twitter,
        text: text || (call ? "(callout, no thesis text)" : ""),
        when, mc,
        valueUsd: holdUsd != null ? holdUsd : null,
      });
    }
    if (out.length) break;
  }
  return sortCalloutRows(out);
}

async function pumpRepliesFallback(ca) {
  if (!isCa(ca) || isEvmCa(ca)) return [];
  const out = [];
  const seen = new Set();
  const limit = 50;
  for (let offset = 0; offset < 150; offset += limit) {
    const urls = [
      "https://frontend-api-v3.pump.fun/replies/" + ca + "?limit=" + limit + "&offset=" + offset + "&reverseOrder=false",
      "https://frontend-api-v3.pump.fun/replies/" + ca + "?limit=" + limit + "&offset=" + offset,
    ];
    let list = [];
    for (const u of urls) {
      const r = await jget(u);
      const next = asReplyList(r.data);
      if (next.length) { list = next; break; }
    }
    if (!list.length) break;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const { name, addr, twitter } = replyUser(row);
      const text = replyText(row);
      const when = replyWhen(row);
      if (!name && !addr && !text) continue;
      const key = String(row.id || row._id || "") + "|" + addr + "|" + (when ? when.getTime() : "") + "|" + text.slice(0, 48);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, addr, twitter: twitter || "", text, when, mc: replyMc(row), valueUsd: replyPositionUsd(row) });
    }
    if (list.length < limit) break;
  }
  return sortCalloutRows(out);
}

async function pumpOfficialCallouts(ca) {
  if (!isCa(ca) || isEvmCa(ca)) return [];
  const urls = [
    "https://frontend-api-v3.pump.fun/callout/top/" + ca + "?limit=50&sortBy=TIMESTAMP&sortOrder=ASC",
    "https://frontend-api-v3.pump.fun/callouts?mint=" + encodeURIComponent(ca) + "&limit=50&sortBy=TIMESTAMP&sortOrder=ASC",
    "https://advanced-api-v2.pump.fun/callout/top/" + ca + "?limit=50&sortBy=TIMESTAMP&sortOrder=ASC",
    "https://advanced-api-v2.pump.fun/callout/list/" + ca + "?limit=50&sortBy=TIMESTAMP&sortOrder=ASC",
  ];
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const r = await jget(u);
    const list = asReplyList(r.data);
    if (!list.length) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const { name, addr, twitter } = replyUser(row);
      const text = replyText(row);
      const when = replyWhen(row);
      if (!name && !addr && !text) continue;
      const key = (addr || name) + "|" + (when ? when.getTime() : "") + "|" + text.slice(0, 48);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, addr, twitter: twitter || "", text, when, mc: replyMc(row), valueUsd: replyPositionUsd(row) });
    }
    if (out.length) break;
  }
  return sortCalloutRows(out);
}

/* ───────── Dev helpers (from Telegram bot) ───────── */
function pickCount(data) {
  if (data == null) return null;
  if (typeof data === "number" && Number.isFinite(data)) return data >= 0 ? data : null;
  if (typeof data !== "object") return null;
  const n =
    data.count ?? data.total ?? data.followers ?? data.following ??
    data.followerCount ?? data.followingCount ?? data.followers_count ?? data.following_count ??
    (data.data && (data.data.count ?? data.data.total));
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : null;
}
function asCoinList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const list = data.coins || data.data || data.tokens || data.items;
  return Array.isArray(list) ? list : [];
}
function creatorFromSources(pump, tokenInfo) {
  return (
    (pump && pump.creator) ||
    (tokenInfo && tokenInfo.token && tokenInfo.token.creation && tokenInfo.token.creation.creator) ||
    (tokenInfo && tokenInfo.token && tokenInfo.token.creator) ||
    (tokenInfo && tokenInfo.creator) ||
    (tokenInfo && tokenInfo.deployer) ||
    (tokenInfo && tokenInfo.pools && tokenInfo.pools[0] && tokenInfo.pools[0].deployer) ||
    ""
  );
}
function isDevTokenMigrated(row) {
  if (!row) return false;
  if (row.complete === true || row.complete === "true" || row.complete === 1) return true;
  if (row.raydium_pool || row.pump_swap_pool || row.market_id) return true;
  const status = String(row.status || "").toLowerCase();
  if (status === "graduated" || status === "migrated" || status === "complete") return true;
  const market = String(row.market || row.dex || "").toLowerCase();
  if (/pumpswap|pump-amm|pumpamm|pumpfun-amm|raydium|meteora|orca/.test(market) && !/pumpfun$|pump\.fun|launchpad/.test(market)) {
    return true;
  }
  return false;
}
function athFromPayload(data) {
  if (!data || typeof data !== "object") return null;
  return (
    num(data.highest_market_cap) || num(data.highestMarketCap) ||
    num(data.ath_market_cap) || num(data.athMarketCap) || num(data.athMarketCapUsd) ||
    num(data.market_cap_ath) || num(data.usd_ath_market_cap) ||
    num(data.ath && (data.ath.market_cap || data.ath.usd || data.ath.marketCap)) ||
    null
  );
}
async function pumpUserProfile(creator) {
  const urls = [
    "https://frontend-api-v3.pump.fun/users/" + creator,
    "https://frontend-api-v3.pump.fun/profile/" + creator,
  ];
  for (const u of urls) {
    const r = await jget(u);
    if (r.ok && r.data && typeof r.data === "object") return r.data;
  }
  return null;
}
async function pumpFollowCounts(creator) {
  const [fol, fing] = await Promise.all([
    jget("https://frontend-api-v3.pump.fun/v3/followers/count/" + creator),
    jget("https://frontend-api-v3.pump.fun/following/v3/following/count/" + creator),
  ]);
  return { followers: pickCount(fol.data), following: pickCount(fing.data) };
}
async function pumpCreatedCoins(creator) {
  const out = [];
  const seen = new Set();
  const paths = [
    "https://frontend-api-v3.pump.fun/coins/user-created-coins/" + creator,
    "https://frontend-api-v3.pump.fun/coins-v2/user-created-coins/" + creator,
  ];
  for (const base of paths) {
    let got = 0;
    for (let offset = 0; offset < 500; offset += 50) {
      const r = await jget(base + "?offset=" + offset + "&limit=50&includeNsfw=true");
      const list = asCoinList(r.data);
      if (!list.length) break;
      for (const c of list) {
        const mint = c && (c.mint || c.address);
        if (!mint || seen.has(mint)) continue;
        seen.add(mint);
        out.push(c);
        got += 1;
      }
      if (list.length < 50) break;
    }
    if (got) break;
  }
  return out;
}
async function stDeployerTokens(creator) {
  if (!(await hasValidKey()) || !creator) return [];
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= 3; page++) {
    const data = await st("/deployer/" + creator + "?page=" + page + "&limit=250&launchpad=pumpfun");
    if (!data) break;
    const list = asCoinList(data) || (data && data.tokens) || [];
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) break;
    for (const row of rows) {
      const mint = row && (row.mint || (row.token && row.token.mint) || row.address);
      if (!mint || seen.has(mint)) continue;
      seen.add(mint);
      out.push(row);
    }
    if (rows.length < 250) break;
  }
  // also try simple path used previously
  if (!out.length) {
    const data = await st("/deployer/" + creator + "/tokens");
    const list = Array.isArray(data) ? data : (data && (data.tokens || data.data)) || [];
    for (const c of list) {
      const mint = c && (c.mint || c.address || c.token);
      if (!mint || seen.has(mint)) continue;
      seen.add(mint);
      out.push(c);
    }
  }
  return out;
}
function mergeDevToken(map, raw) {
  if (!raw || typeof raw !== "object") return;
  const tok = raw.token || raw;
  const mint = tok.mint || raw.mint || tok.address || raw.address;
  if (!mint) return;
  const prev = map.get(mint) || {
    mint, name: "", symbol: "", created: null, currentMc: null, peakMc: null, migrated: false,
  };
  const name = tok.name || raw.name || prev.name;
  const symbol = tok.symbol || raw.symbol || prev.symbol;
  const created =
    toDate(raw.created_timestamp || tok.created_timestamp || raw.createdAt || tok.createdAt ||
      (tok.creation && tok.creation.created_time)) || prev.created;
  const currentMc =
    num(raw.usd_market_cap) || num(raw.marketCapUsd) || num(raw.market_cap) ||
    num(tok.marketCap) || num(tok.usd_market_cap) ||
    num(raw.pools && raw.pools[0] && raw.pools[0].marketCap && raw.pools[0].marketCap.usd) ||
    prev.currentMc;
  const peakHint = athFromPayload(raw) || athFromPayload(tok) || prev.peakMc;
  const migrated = prev.migrated || isDevTokenMigrated(raw) || isDevTokenMigrated(tok);
  map.set(mint, {
    mint, name, symbol, created, currentMc,
    peakMc: peakHint && currentMc ? Math.max(peakHint, currentMc) : peakHint || currentMc || prev.peakMc,
    migrated,
  });
}
function rateDev(stats) {
  const total = stats.total || 0;
  const migrated = stats.migrated || 0;
  const rate = total ? migrated / total : 0;
  const best = stats.bestPeak || 0;
  const never = stats.neverMoved || 0;
  const followers = stats.followers || 0;
  let score = 42;
  const notes = [];
  if (total === 0) return { score: 0, verdict: "❌ no history", notes: ["no tokens found"] };
  if (rate >= 0.15) { score += 28; notes.push("strong migrate rate"); }
  else if (rate >= 0.05) { score += 16; notes.push("some migrations"); }
  else if (migrated >= 1) { score += 8; notes.push("rare migrate"); }
  else { score -= 14; notes.push("no migrations"); }
  if (migrated >= 5) score += 10;
  else if (migrated >= 2) score += 6;
  if (best >= 1e6) { score += 18; notes.push("hit 1M+ ATH"); }
  else if (best >= 1e5) { score += 12; notes.push("hit 100k+ ATH"); }
  else if (best >= 20000) { score += 5; notes.push("some heat"); }
  else { score -= 8; notes.push("low ATH book"); }
  if (total >= 80 && rate < 0.03) { score -= 16; notes.push("serial deployer"); }
  else if (total >= 25 && rate < 0.04) { score -= 8; notes.push("high volume deploys"); }
  if (total && never / total >= 0.7) { score -= 8; notes.push("most never moved"); }
  if (followers >= 5000) score += 6;
  else if (followers >= 500) score += 3;
  score = Math.max(0, Math.min(100, score));
  let verdict = "❌ weak";
  if (score >= 75) verdict = "✅ strong";
  else if (score >= 55) verdict = "⚠️ mixed";
  return { score, verdict, notes };
}


async function buildDevCards(ca) {
  if (!(await hasValidKey())) return [{ icon: "👨‍💻", title: "Dev", html: "Add Vexlore Special Key for full dev history + rating." }];
  if (isEvmCa(ca)) return [{ icon: "👨‍💻", title: "Dev", html: "Full EVM dev history on Telegram @vexlorebot." }];

  const [pump, tokenInfo] = await Promise.all([pumpCoin(ca), st("/tokens/" + ca)]);
  const creator = String(creatorFromSources(pump, tokenInfo) || "").trim();
  if (!creator) {
    return [{ icon: "👨‍💻", title: "Dev", html: "Dev wallet not found.<br><span class='ca'>" + esc(ca) + "</span>" }];
  }

  showMedia({
    image: firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca),
    name: pump && pump.name,
    symbol: pump && pump.symbol,
  });
  lastScan = { ca, chain: "sol", name: pump && pump.name, symbol: pump && pump.symbol };

  const [profile, follows, pumpCoins, stCoins] = await Promise.all([
    pumpUserProfile(creator),
    pumpFollowCounts(creator),
    pumpCreatedCoins(creator),
    stDeployerTokens(creator),
  ]);

  const map = new Map();
  for (const c of pumpCoins) mergeDevToken(map, c);
  for (const c of stCoins) mergeDevToken(map, c);

  const all = [...map.values()];
  const migratedN = all.filter((t) => t.migrated).length;
  const totalN = all.length;
  const neverMoved = all.filter((t) => !num(t.currentMc) && !num(t.peakMc)).length;
  const bestPeak = all.reduce((m, t) => Math.max(m, t.peakMc || t.currentMc || 0), 0);

  all.sort((a, b) => (b.peakMc || b.currentMc || 0) - (a.peakMc || a.currentMc || 0));
  const top = all.slice(0, 10);

  const followers =
    pickCount(profile && (profile.followers ?? profile.follower_count ?? profile.followersCount)) ??
    follows.followers;
  const following =
    pickCount(profile && (profile.following ?? profile.following_count ?? profile.followingCount)) ??
    follows.following;
  const devName =
    (profile && (profile.username || profile.name || profile.displayName)) ||
    (pump && pump.username) ||
    "unknown";

  const rated = rateDev({
    total: totalN,
    migrated: migratedN,
    bestPeak,
    neverMoved,
    followers: followers || 0,
  });
  const migrateRate = totalN ? ((migratedN / totalN) * 100).toFixed(1) + "%" : "n/a";

  const topHtml = top.map((t, i) => {
    const crown = t.migrated ? " 👑" : "";
    return `${i + 1}. <b>${esc(t.name || "")}</b> (${esc(t.symbol || "")})${crown}<br>` +
      `<span class="ca">${esc(t.mint)}</span><br>` +
      `🕐 ${utc(t.created)} · MC ${moneyMkt(t.currentMc)}${t.peakMc ? " · peak " + money(t.peakMc) : ""}` +
      (t.migrated ? " · <b>migrated</b>" : "");
  }).join("<br><br>");

  return [
    {
      icon: "👨‍💻",
      title: `Dev rating ${rated.score}/100  ${rated.verdict}`,
      html: `Wallet: <span class="ca">${esc(creator)}</span><br>` +
        `Name: <b>${esc(devName)}</b><br>` +
        (followers != null ? `Followers ${followers}${following != null ? " · following " + following : ""}<br>` : "") +
        `<br>📦 Tokens launched: <b>${totalN}</b><br>` +
        `👑 Migrated: <b>${migratedN}/${totalN}</b> (${migrateRate})<br>` +
        `🏆 Best peak MC: ${money(bestPeak)}<br>` +
        `💤 Never moved: ${neverMoved}<br>` +
        `Notes: ${esc(rated.notes.join(" · ") || "n/a")}`,
    },
    {
      icon: "📜",
      title: "Top tokens (👑 = migrated)",
      html: topHtml || "none",
    },
  ];
}


async function buildCalloutsCards(ca) {
  if (isEvmCa(ca)) return [{ icon: "📣", title: "Callouts", html: "Callouts are Pump.fun (Solana) only." }];
  const [pump, pair, primary] = await Promise.all([
    pumpCoin(ca),
    dexSolPair(ca),
    pumpMintCallouts(ca),
  ]);
  showMedia({
    image: pairDexMedia(pair).image || firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca),
    name: pump && pump.name,
    symbol: pump && pump.symbol,
  });
  lastScan = { ca, chain: "sol", name: pump && pump.name, symbol: pump && pump.symbol };

  let rows = Array.isArray(primary) ? primary : [];
  let source = rows.length ? "Pump.fun callouts (mint positions)" : "none";

  if (!rows.length) {
    const [comments, official] = await Promise.all([
      pumpRepliesFallback(ca),
      pumpOfficialCallouts(ca),
    ]);
    if (comments && comments.length) {
      rows = comments;
      source = "Pump.fun comments";
    } else if (official && official.length) {
      rows = official;
      source = "official Pump.fun callouts";
    }
  }

  const lines = rows.slice(0, 15).map((c, i) => {
    const who = c.name ? "@" + String(c.name).replace(/^@/, "") : "anon";
    const tag = c.valueUsd != null ? walletUsdSize(c.valueUsd) : "SHRIMP";
    const icon = walletSizeIcon(tag);
    const tw = c.twitter ? String(c.twitter).replace(/^@/, "") : "";
    const textLine = c.text ? esc(String(c.text).slice(0, 200)) : "<i>no comment text</i>";
    return (
      `${i + 1}. ${icon} ${tag} <b>${esc(who)}</b><br>` +
      (c.addr ? `<span class="ca">${esc(c.addr)}</span><br>` : "") +
      (tw ? `🐦 @${esc(tw)}<br>` : "") +
      `🕐 ${utc(c.when)}` +
      (c.mc != null ? ` · called @ MC ${moneyMkt(c.mc)}` : "") +
      (c.valueUsd != null ? ` · pos ${money(c.valueUsd)}` : "") +
      `<br>${textLine}`
    );
  }).join("<br><br>");

  const walletList = rows
    .filter((c) => c.addr)
    .slice(0, 20)
    .map((c, i) => {
      const who = c.name ? "@" + String(c.name).replace(/^@/, "") : "anon";
      return `${i + 1}. <b>${esc(who)}</b><br><span class="ca">${esc(c.addr)}</span>`;
    })
    .join("<br><br>");

  return [
    {
      icon: "📣",
      title: "Pump.fun callouts",
      html: `<b>${esc((pump && pump.name) || "Token")}</b> (${esc((pump && pump.symbol) || "?")})<br>` +
        `<span class="ca">${esc(ca)}</span><br><br>` +
        `Source: ${esc(source)}<br>` +
        `Count: ${rows.length} · order: first → last<br><br>` +
        (lines || "No Pump.fun callouts found for this CA.<br>(Only tokens with on-platform callouts/thesis show here.)"),
    },
    {
      icon: "👛",
      title: "Caller wallets",
      html: walletList || "No wallets linked to callouts",
    },
  ];
}


async function buildLoreCards(ca, chainKey, pair) {
  if (!(await hasValidKey()) && chainKey === "sol") {
    return [{ icon: "🧠", title: "Lore", html: "Add Vexlore Special Key for full lore analysis." }];
  }
  const isSol = chainKey === "sol";
  const [pump, tokenInfo] = await Promise.all([
    isSol ? pumpCoin(ca) : null,
    isSol ? st("/tokens/" + ca) : null,
  ]);
  const fam = await findFamily(ca, pair, chainKey);
  const q = marketQuote(pump, pair, tokenInfo);
  showMedia({
    image: pairDexMedia(pair).image || firstHttpUrl(pump && pump.image_uri) || dexCdnImage(ca, CHAINS[chainKey]?.id),
    name: q.name, symbol: q.symbol,
  });
  lastScan = { ca, chain: chainKey, name: q.name, symbol: q.symbol };

  const risk = tokenRisk(tokenInfo);
  const sniperPct = Number((risk.snipers && (risk.snipers.totalPercentage || risk.snipers.percentage)) || 0);
  const insiderPct = Number((risk.insiders && risk.insiders.totalPercentage) || 0);

  let score = 50;
  const notes = [];
  if (fam.isOg) { score += 25; notes.push("OG mint"); }
  else if (fam.all.length > 3) { score -= 15; notes.push("multiple vamps"); }
  if (sniperPct > 20) { score -= 20; notes.push("high snipers"); }
  else if (sniperPct < 5 && isSol) { score += 10; notes.push("low snipers"); }
  if (insiderPct > 15) { score -= 15; notes.push("insider heavy"); }
  if (num(q.liq) > 50000) { score += 10; notes.push("healthy liq"); }
  score = Math.max(0, Math.min(100, score));
  let verdict = score >= 75 ? "Strong lore" : score >= 55 ? "Decent" : score >= 35 ? "Risky" : "Weak / avoid";

  return [{
    icon: "🧠",
    title: `Lore ${score}/100  ${verdict}`,
    html: `<b>${esc(q.name)}</b> (${esc(q.symbol)}) · ${(CHAINS[chainKey] && CHAINS[chainKey].label) || chainKey}<br><br>
${esc(ogLine(fam)).replace(/\n/g, "<br>")}<br><br>
🎯 Snipers ${pct(sniperPct)} · Insiders ${pct(insiderPct)}<br>
Notes: ${notes.join(" · ") || "n/a"}`,
  }];
}

async function buildGithubCards(owner, repoName) {
  hideMedia();
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "VEXLORE-Extension" };
  if (settings.ghToken) headers.Authorization = "Bearer " + settings.ghToken;
  const userRes = await jget("https://api.github.com/users/" + encodeURIComponent(owner), headers);
  if (!userRes.ok || !userRes.data || !userRes.data.login) {
    return [{ icon: "👾", title: "GitHub", html: "User/org not found.<br>" + esc(owner) }];
  }
  const o = userRes.data;
  let repoHtml = "";
  if (repoName) {
    const repoRes = await jget(`https://api.github.com/repos/${encodeURIComponent(o.login)}/${encodeURIComponent(repoName)}`, headers);
    if (!repoRes.ok || !repoRes.data) {
      return [{ icon: "👾", title: "GitHub", html: "Repo not found.<br>" + esc(o.login + "/" + repoName) }];
    }
    const r = repoRes.data;
    repoHtml = `<br><br><b>${esc(r.full_name)}</b><br>${esc(r.description || "No description")}<br>⭐ ${r.stargazers_count} · 🍴 ${r.forks_count}<br>💻 ${esc(r.language || "n/a")}<br>🕐 created ${utc(toDate(r.created_at))}<br>🕐 pushed ${utc(toDate(r.pushed_at))}<br><a href="${esc(r.html_url)}" target="_blank" style="color:var(--cyan)">Open repo</a>`;
  }
  return [{
    icon: "👾",
    title: "GitHub",
    html: `<b>${esc(o.login)}</b> · ${esc(o.type || "User")}<br>Repos ${o.public_repos} · Followers ${o.followers}${repoHtml}`,
  }];
}

/* ───────── main runner ───────── */
async function run(kind) {
  const raw = input.value.trim();
  try {
    if (kind === "tg") {
      chrome.tabs.create({ url: "https://t.me/" + BOT });
      return;
    }
    if (LOCKED_FEATURES.includes(kind) && !(await hasValidKey())) {
      showUpgradeMessage("locked");
      return;
    }
    if (!(await hasValidKey())) {
      const usage = await getUsage();
      if (usage.count >= FREE_LIMIT) {
        showUpgradeMessage("limit");
        return;
      }
    }
    setLoading();

    const gh = extractGithub(raw);
    if (kind === "git" || (gh && gh.owner && !extractAnyCa(raw).ca)) {
      if (!gh || !gh.owner) {
        out.innerHTML = `<div class="card"><div class="body muted">Paste github.com/owner/repo</div></div>`;
        return;
      }
      renderCards(await buildGithubCards(gh.owner, gh.repo));
      if (!(await hasValidKey())) await incrementUsage();
      await updateUsageBar();
      return;
    }

    const hit = extractAnyCa(raw);
    if (!hit.ca) {
      out.innerHTML = `<div class="card"><div class="body muted">Paste a Solana CA or 0x address first ✨</div></div>`;
      hideMedia();
      return;
    }

    const detected = await detectChainAndPair(hit.ca);
    const chainKey = detected.chain === "unknown" ? (isEvmCa(hit.ca) ? "eth" : "sol") : detected.chain;
    const pair = detected.pair;

    if (kind === "vamp") renderCards(await buildVampCards(hit.ca, chainKey, pair));
    else if (kind === "bundle") renderCards(await buildBundleCards(hit.ca));
    else if (kind === "dev") renderCards(await buildDevCards(hit.ca));
    else if (kind === "callouts") renderCards(await buildCalloutsCards(hit.ca));
    else if (kind === "holders") renderCards(await buildHoldersCards(hit.ca, chainKey));
    else if (kind === "lore") renderCards(await buildLoreCards(hit.ca, chainKey, pair));
    else renderCards(await buildReportCards(hit.ca, chainKey, pair));

    if (!(await hasValidKey())) await incrementUsage();
    await updateUsageBar();
  } catch (e) {
    showErr(e);
  }
}

/* ───────── clipboard ───────── */
async function checkClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || text === lastClip) return;
    const hit = extractAnyCa(text);
    const gh = extractGithub(text);
    if (hit.ca) {
      lastClip = text;
      input.value = hit.ca;
      clipHint.textContent = "✨ CA detected from clipboard";
      if (settings.autoScan) run("scan");
    } else if (gh && gh.owner) {
      lastClip = text;
      input.value = gh.repo ? `${gh.owner}/${gh.repo}` : gh.owner;
      clipHint.textContent = "✨ GitHub link detected";
      if (settings.autoScan) run("git");
    }
  } catch (_) {}
}

/* ───────── wire UI ───────── */
document.getElementById("scan").onclick = () => run("scan");
document.querySelectorAll(".chip").forEach((btn) => {
  btn.onclick = () => run(btn.getAttribute("data-kind"));
});
document.getElementById("btnSettings").onclick = () => {
  loadSettings();
  showPanel("settings");
};
document.getElementById("btnHistory").onclick = async () => {
  await renderHistory();
  showPanel("history");
};
document.getElementById("backMain").onclick = () => showPanel("main");
document.getElementById("backFromHistory").onclick = () => showPanel("main");
document.getElementById("saveSettings").onclick = () => saveSettings();
document.getElementById("clearHistory").onclick = async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory();
};
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run("scan");
});
setInterval(checkClipboard, 1500);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkClipboard();
});
window.addEventListener("focus", checkClipboard);

loadSettings().then(async () => {
  clipHint.textContent = settings.autoScan
    ? "Copy a CA → it auto-pastes & scans"
    : "Copy a CA → it auto-pastes (auto-scan off)";
  checkClipboard();
  await updateUsageBar();
});