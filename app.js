const API_BASE = "https://api2.warera.io/trpc/tradingOrder.getTopOrdersPerItemCode";
const ORDER_LIMIT = 100;
const CACHE_PREFIX = "warEraOrderBook:";

const ITEMS = [
  "cookedFish", "heavyAmmo", "steel", "bread", "grain", "limestone",
  "coca", "concrete", "oil", "case1", "lightAmmo", "steak", "livestock",
  "cocain", "lead", "fish", "petroleum", "ammo", "iron", "scraps", "case2",
  "wood", "paper", "woodenCase"
];

const els = {
  apiKey: document.getElementById("apiKey"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
  itemSelect: document.getElementById("itemSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  pngBtn: document.getElementById("pngBtn"),
  status: document.getElementById("status"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
  cacheBadge: document.getElementById("cacheBadge"),
  error: document.getElementById("error"),
  empty: document.getElementById("empty"),
  chartViewport: document.getElementById("chartViewport"),
  chart: document.getElementById("chart")
};

let currentBook = null;
let currentFetchedAt = null;
let currentWasCached = false;

function prettyItem(code) {
  const special = {
    cookedFish: "Cooked Fish",
    heavyAmmo: "Heavy Ammo",
    lightAmmo: "Light Ammo",
    woodenCase: "Wooden Case",
    case1: "Case 1",
    case2: "Case 2"
  };
  if (special[code]) return special[code];
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function formatTimestamp(iso) {
  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZoneName: "short"
  }).format(new Date(iso));
}

function cacheKey(item) {
  return CACHE_PREFIX + item;
}

function readCache(item) {
  try {
    const raw = localStorage.getItem(cacheKey(item));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(item, data, fetchedAt) {
  try {
    localStorage.setItem(cacheKey(item), JSON.stringify({ data, fetchedAt }));
  } catch {
    // Cache is an enhancement; failure should not prevent displaying live data.
  }
}

function setStatus(text) {
  els.status.textContent = text || "";
}

function showError(text) {
  els.error.hidden = !text;
  els.error.textContent = text || "";
}

function setLoading(loading) {
  els.refreshBtn.disabled = loading;
  els.itemSelect.disabled = loading;
  els.refreshBtn.textContent = loading ? "Loading…" : "Refresh";
}

function extractBook(payload, item) {
  const data = payload?.result?.data?.[item];
  if (!data || !Array.isArray(data.buyOrders) || !Array.isArray(data.sellOrders)) {
    throw new Error("The API response did not contain the expected buyOrders/sellOrders structure.");
  }
  return {
    buyOrders: data.buyOrders,
    sellOrders: data.sellOrders
  };
}

async function fetchOrderBook(item) {
  const input = encodeURIComponent(JSON.stringify({ itemCodes: [item], limit: ORDER_LIMIT }));
  const response = await fetch(`${API_BASE}?input=${input}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-api-key": els.apiKey.value.trim()
    }
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      const message = body?.error?.json?.message || body?.error?.message;
      if (message) detail += `: ${message}`;
    } catch {
      // Keep the HTTP status when the response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

function normalizeOrders(orders, side) {
  return orders
    .filter(o => Number.isFinite(Number(o.price)) && Number.isFinite(Number(o.quantity)))
    .map(o => ({
      price: Number(o.price),
      quantity: Number(o.quantity),
      offerAt: o.offerAt,
      type: side
    }));
}

function renderChart(book, item) {
  const buys = normalizeOrders(book.buyOrders, "buy")
    .sort((a, b) => b.price - a.price);
  const sells = normalizeOrders(book.sellOrders, "sell")
    .sort((a, b) => a.price - b.price);

  const rows = Math.max(buys.length, sells.length);
  const rowHeight = 28;
  const headerHeight = 64;
  const height = headerHeight + Math.max(rows, 1) * rowHeight + 18;
  const width = 1100;
  const centerX = width / 2;
  const barMax = 360;
  const leftValueX = centerX - 395;
  const leftBarEnd = centerX - 15;
  const rightBarStart = centerX + 15;
  const rightValueX = centerX + 395;
  const maxQuantity = Math.max(
    1,
    ...buys.map(o => o.quantity),
    ...sells.map(o => o.quantity)
  );

  const escapeXml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

  const text = (x, y, value, opts = {}) => {
    const anchor = opts.anchor || "start";
    const weight = opts.weight || 400;
    const size = opts.size || 14;
    const fill = opts.fill || "#344054";
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" class="orderbook-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(prettyItem(item))} order book">`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
  svg += text(centerX, 25, prettyItem(item), { anchor: "middle", weight: 700, size: 18, fill: "#172033" });
  svg += text(centerX, 47, "Buy orders                         Sell orders", { anchor: "middle", weight: 600, size: 12, fill: "#667085" });
  svg += `<line x1="${centerX}" y1="58" x2="${centerX}" y2="${height - 10}" stroke="#d0d5dd" stroke-width="1"/>`;

  for (let i = 0; i < rows; i++) {
    const y = headerHeight + i * rowHeight;
    const buy = buys[i];
    const sell = sells[i];
    if (i % 2 === 0) svg += `<rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="#fafbfc"/>`;

    if (buy) {
      const barWidth = Math.max(2, (buy.quantity / maxQuantity) * barMax);
      svg += `<rect x="${leftBarEnd - barWidth}" y="${y + 6}" width="${barWidth}" height="16" rx="3" fill="#dbeafe"/>`;
      svg += text(leftValueX, y + 18, formatNumber(buy.quantity), { anchor: "end", size: 12, fill: "#475467" });
      svg += text(leftBarEnd - barWidth - 8, y + 18, formatNumber(buy.price), { anchor: "end", size: 13, weight: 650, fill: "#175cd3" });
    }

    if (sell) {
      const barWidth = Math.max(2, (sell.quantity / maxQuantity) * barMax);
      svg += `<rect x="${rightBarStart}" y="${y + 6}" width="${barWidth}" height="16" rx="3" fill="#fee4e2"/>`;
      svg += text(rightValueX, y + 18, formatNumber(sell.quantity), { anchor: "start", size: 12, fill: "#475467" });
      svg += text(rightBarStart + barWidth + 8, y + 18, formatNumber(sell.price), { anchor: "start", size: 13, weight: 650, fill: "#b42318" });
    }
  }

  if (!buys.length) svg += text(centerX - 30, headerHeight + 18, "No buy orders", { anchor: "end", size: 12, fill: "#98a2b3" });
  if (!sells.length) svg += text(centerX + 30, headerHeight + 18, "No sell orders", { anchor: "start", size: 12, fill: "#98a2b3" });

  svg += `</svg>`;
  els.chart.innerHTML = svg;
}

function displayBook(book, item, fetchedAt, cached) {
  currentBook = book;
  currentFetchedAt = fetchedAt;
  currentWasCached = cached;

  els.bookTitle.textContent = `${prettyItem(item)} Order Book`;
  els.bookMeta.textContent = `Retrieved ${formatTimestamp(fetchedAt)} · ${book.buyOrders.length} buy / ${book.sellOrders.length} sell orders`;
  els.cacheBadge.hidden = !cached;
  els.empty.hidden = true;
  els.chartViewport.hidden = false;
  renderChart(book, item);
}

async function loadSelected({ forceRefresh = false } = {}) {
  const item = els.itemSelect.value;
  const apiKey = els.apiKey.value.trim();

  showError("");
  if (!apiKey) {
    els.empty.hidden = false;
    els.chartViewport.hidden = true;
    els.bookMeta.textContent = "No API key provided";
    setStatus("API key required");
    return;
  }

  if (!forceRefresh) {
    const cached = readCache(item);
    if (cached) {
      displayBook(cached.data, item, cached.fetchedAt, true);
      setStatus("Loaded from browser cache");
      return;
    }
  }

  setLoading(true);
  setStatus("Fetching order book…");
  try {
    const payload = await fetchOrderBook(item);
    const book = extractBook(payload, item);
    const fetchedAt = new Date().toISOString();
    writeCache(item, book, fetchedAt);
    displayBook(book, item, fetchedAt, false);
    setStatus("Live data loaded");
  } catch (error) {
    const message = error instanceof TypeError && String(error.message).includes("fetch")
      ? "The browser could not complete the request. This may be a CORS/network issue or the API may be unavailable."
      : error.message;
    showError(message);
    setStatus("Request failed");
  } finally {
    setLoading(false);
  }
}

function exportPng() {
  const svg = els.chart.querySelector("svg");
  if (!svg || !currentBook) return;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  image.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const item = els.itemSelect.value;
    const link = document.createElement("a");
    link.download = `war-era-order-book-${item}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
    showError("PNG export failed.");
  };

  image.src = url;
}

function initialize() {
  for (const item of ITEMS) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = prettyItem(item);
    els.itemSelect.appendChild(option);
  }

  els.itemSelect.value = "ammo";

  els.refreshBtn.addEventListener("click", () => loadSelected({ forceRefresh: true }));
  els.itemSelect.addEventListener("change", () => loadSelected({ forceRefresh: false }));
  els.pngBtn.addEventListener("click", exportPng);
  els.clearKeyBtn.addEventListener("click", () => {
    els.apiKey.value = "";
    currentBook = null;
    currentFetchedAt = null;
    els.chart.innerHTML = "";
    els.chartViewport.hidden = true;
    els.empty.hidden = false;
    els.bookMeta.textContent = "No data loaded";
    els.cacheBadge.hidden = true;
    showError("");
    setStatus("");
    els.apiKey.focus();
  });

  els.apiKey.addEventListener("keydown", event => {
    if (event.key === "Enter") loadSelected({ forceRefresh: false });
  });
}

initialize();
