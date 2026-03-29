/* ============================================================
   花粉ダッシュボード JS
   ============================================================ */

// ---- Palettes ----
const C = {
  cedar:    "#ffd600",
  cedar2:   "#ff8f00",
  cypress:  "#40c4ff",
  cypress2: "#0091ea",
  prevYear: "#ce93d8",
  prevYear2:"#9c27b0",
  bg:       "#090d1f",
  panel:    "#0d1530",
  border:   "#1e2d5a",
  text:     "#e8eaf6",
  muted:    "#7986cb",
  green:    "#00e676",
  red:      "#ff5252",
};

const LEVEL_LABELS = ["なし", "少ない", "やや多い", "多い", "非常に多い"];

// ---- State ----
let state = {
  area:        "shinagawa",
  year:        new Date().getFullYear(),
  type:        "both",    // both | cedar | cypress
  chartType:   "bar",     // bar | line
  month:       "all",
  compareTypeKey: "cedar", // cedar | cypress
  availableYears: [],
  annualData:  [],
};

let mainChart    = null;
let compareChart = null;
let gaugeCedar   = null;
let gaugeCypress = null;

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  buildGauges();
  fetchAnnual();
});

// ---- UI bindings ----
function bindUI() {
  // Area tabs
  document.querySelectorAll(".area-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".area-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.area = btn.dataset.area;
      fetchAnnual();
    });
  });

  // Type segs
  document.querySelectorAll(".seg[data-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg[data-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.type = btn.dataset.type;
      updateMainChart();
    });
  });

  // Chart type segs
  document.querySelectorAll(".seg[data-chart]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg[data-chart]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.chartType = btn.dataset.chart;
      rebuildMainChart();
    });
  });

  // Compare type segs
  document.querySelectorAll(".seg[data-compare-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg[data-compare-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.compareTypeKey = btn.dataset.compareType;
      fetchCompare();
    });
  });

  // Year select
  document.getElementById("yearSelect").addEventListener("change", e => {
    state.year = parseInt(e.target.value);
    updateMainChart();
    syncCompareYears();
    fetchCompare();
  });

  // Month filter
  document.getElementById("monthFilter").addEventListener("change", e => {
    state.month = e.target.value;
    updateMainChart();
  });

  // Compare year selects
  document.getElementById("compareYearA").addEventListener("change", () => fetchCompare());
  document.getElementById("compareYearB").addEventListener("change", () => fetchCompare());
}

// ---- Fetch annual data ----
async function fetchAnnual() {
  showMainLoading("データ読み込み中...");
  try {
    const res  = await fetch(`/api/pollen/annual?area=${state.area}&year=${state.year}`);
    const json = await res.json();

    state.annualData    = json.data || [];
    state.availableYears = json.available_years || [state.year];

    // year select
    const sel = document.getElementById("yearSelect");
    const prev = sel.value;
    sel.innerHTML = "";
    state.availableYears.forEach(y => {
      const o = document.createElement("option");
      o.value = y; o.textContent = `${y}年`;
      if (y === state.year) o.selected = true;
      sel.appendChild(o);
    });

    // Update area badge
    document.getElementById("areaBadge").textContent  = json.area_name;
    document.getElementById("compareBadge").textContent = json.area_name;

    // last update
    if (json.latest_update) {
      document.getElementById("lastUpdate").textContent =
        "最終更新: " + json.latest_update.slice(0, 16).replace("T", " ");
    }

    syncCompareYears();
    updateGauges(state.annualData);
    updateStats(state.annualData);
    rebuildMainChart();
    await fetchCompare();

  } catch (e) {
    toast("データ取得エラー: " + e.message, true);
  } finally {
    hideMainLoading();
  }
}

// ---- Fetch comparison data ----
async function fetchCompare() {
  const yearA = parseInt(document.getElementById("compareYearA").value) || state.year;
  const yearB = parseInt(document.getElementById("compareYearB").value) || state.year - 1;

  try {
    const res  = await fetch(`/api/pollen/compare?area=${state.area}&year_a=${yearA}&year_b=${yearB}`);
    const json = await res.json();
    renderCompareChart(json);
    renderDiffSummary(json);
  } catch (e) {
    // silent
  }
}

function syncCompareYears() {
  const years = state.availableYears;
  const selA = document.getElementById("compareYearA");
  const selB = document.getElementById("compareYearB");

  [selA, selB].forEach(sel => {
    const prev = parseInt(sel.value);
    sel.innerHTML = "";
    years.forEach(y => {
      const o = document.createElement("option");
      o.value = y; o.textContent = `${y}年`;
      sel.appendChild(o);
    });
    if (prev && years.includes(prev)) sel.value = prev;
  });

  // デフォルト: A=最新, B=1つ前
  if (years.length >= 1) selA.value = years[0];
  if (years.length >= 2) selB.value = years[1];
}

// ---- Gauge charts ----
function buildGauges() {
  gaugeCedar   = createGauge("gaugeCedar",   C.cedar,   C.cedar2);
  gaugeCypress = createGauge("gaugeCypress", C.cypress, C.cypress2);
}

function createGauge(id, color, color2) {
  const ctx = document.getElementById(id).getContext("2d");
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [0, 4],
        backgroundColor: [color, "#1e2d5a"],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }],
    },
    options: {
      cutout: "72%",
      responsive: false,
      animation: { duration: 600 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

function updateGauges(data) {
  const today = data[data.length - 1] || null;
  const cv = today ? today.cedar   : null;
  const cyv= today ? today.cypress : null;

  setGauge(gaugeCedar,   cv,  "gaugeCedarVal",   "gaugeCedarLabel",   "kpiCedarSub",   C.cedar,   C.cedar2);
  setGauge(gaugeCypress, cyv, "gaugeCypressVal",  "gaugeCypressLabel", "kpiCypressSub", C.cypress, C.cypress2);
}

function setGauge(g, val, valId, labelId, subId, col, col2) {
  if (!g) return;
  const level = val ?? 0;
  g.data.datasets[0].data = [level, Math.max(0, 4 - level)];
  g.data.datasets[0].backgroundColor = [
    level >= 3 ? C.red : level >= 2 ? col2 : col,
    "#1e2d5a",
  ];
  g.update();

  document.getElementById(valId).textContent  = val != null ? val : "—";
  document.getElementById(labelId).textContent = val != null ? LEVEL_LABELS[val] : "データなし";
  document.getElementById(subId).textContent   = val != null
    ? "今日のレベル: " + LEVEL_LABELS[val]
    : "データなし";
}

// ---- Stats ----
function updateStats(data) {
  document.getElementById("statDays").textContent = data.length;

  const cd = data.filter(d => d.cedar   != null);
  const cy = data.filter(d => d.cypress != null);

  if (cd.length) {
    const pk = cd.reduce((a, b) => b.cedar > a.cedar ? b : a);
    document.getElementById("statCedarPeak").textContent = `${pk.cedar} (${LEVEL_LABELS[pk.cedar]})`;
    const avg = cd.reduce((s, d) => s + d.cedar, 0) / cd.length;
    document.getElementById("statCedarAvg").textContent  = avg.toFixed(1);
  } else {
    document.getElementById("statCedarPeak").textContent = "—";
    document.getElementById("statCedarAvg").textContent  = "—";
  }

  if (cy.length) {
    const pk = cy.reduce((a, b) => b.cypress > a.cypress ? b : a);
    document.getElementById("statCypressPeak").textContent = `${pk.cypress} (${LEVEL_LABELS[pk.cypress]})`;
  } else {
    document.getElementById("statCypressPeak").textContent = "—";
  }
}

// ---- Main chart ----
function getFilteredData() {
  if (state.month === "all") return state.annualData;
  const m = parseInt(state.month);
  return state.annualData.filter(d => parseInt(d.date.slice(5, 7)) === m);
}

function rebuildMainChart() {
  if (mainChart) { mainChart.destroy(); mainChart = null; }
  renderMainChart();
}

function updateMainChart() {
  if (!mainChart) { renderMainChart(); return; }
  const fd = getFilteredData();
  mainChart.data.labels   = fd.map(d => fmtDate(d.date));
  mainChart.data.datasets = buildMainDatasets(fd);
  mainChart.update();
  updateDataTable(fd);
}

function buildMainDatasets(fd) {
  const datasets = [];
  const isBar = state.chartType === "bar";
  const pt = fd.length > 90 ? 0 : 3;

  if (state.type !== "cypress") {
    datasets.push({
      label: "スギ花粉",
      data: fd.map(d => d.cedar),
      backgroundColor: isBar ? C.cedar + "cc" : C.cedar + "33",
      borderColor: C.cedar,
      borderWidth: isBar ? 0 : 2,
      fill: !isBar,
      tension: 0.35,
      pointRadius: pt,
      pointHoverRadius: 5,
      spanGaps: true,
      type: state.chartType,
    });
  }

  if (state.type !== "cedar") {
    datasets.push({
      label: "ヒノキ花粉",
      data: fd.map(d => d.cypress),
      backgroundColor: isBar ? C.cypress + "cc" : C.cypress + "33",
      borderColor: C.cypress,
      borderWidth: isBar ? 0 : 2,
      fill: !isBar,
      tension: 0.35,
      pointRadius: pt,
      pointHoverRadius: 5,
      spanGaps: true,
      type: state.chartType,
    });
  }
  return datasets;
}

function renderMainChart() {
  const fd  = getFilteredData();
  const ctx = document.getElementById("mainChart").getContext("2d");

  mainChart = new Chart(ctx, {
    type: state.chartType,
    data: {
      labels: fd.map(d => fmtDate(d.date)),
      datasets: buildMainDatasets(fd),
    },
    options: chartOptions(),
  });

  updateDataTable(fd);
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: window.innerWidth < 700 ? 1.5 : 3.2,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 14,
          maxRotation: 0,
          color: C.muted,
          font: { size: 10 },
        },
        grid: { color: "rgba(30,45,90,.6)" },
      },
      y: {
        min: 0, max: 4,
        ticks: {
          stepSize: 1,
          callback: v => LEVEL_LABELS[v] ?? v,
          color: C.muted,
          font: { size: 10 },
        },
        grid: { color: "rgba(30,45,90,.6)" },
      },
    },
    plugins: {
      tooltip: {
        backgroundColor: "#111a3a",
        borderColor: "#1e2d5a",
        borderWidth: 1,
        titleColor: C.text,
        bodyColor: C.muted,
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y;
            return `${ctx.dataset.label}: ${v != null ? LEVEL_LABELS[v] + " (" + v + ")" : "データなし"}`;
          },
        },
      },
      legend: {
        labels: { color: C.text, font: { size: 11 }, boxWidth: 12 },
      },
      zoom: {
        pan:  { enabled: true, mode: "x" },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
      },
    },
  };
}

function resetZoom() { if (mainChart) mainChart.resetZoom(); }

// ---- Compare chart ----
function renderCompareChart(json) {
  const typeKey = state.compareTypeKey; // "cedar" | "cypress"
  const label   = typeKey === "cedar" ? "スギ花粉" : "ヒノキ花粉";

  const dataA = json.year_a?.data || [];
  const dataB = json.year_b?.data || [];
  const yearA = json.year_a?.year;
  const yearB = json.year_b?.year;

  // 月/日を軸にして揃える ("MM/DD" キー)
  const mapB = {};
  dataB.forEach(d => { mapB[d.date.slice(5)] = d[typeKey]; });

  const labels   = dataA.map(d => fmtDate(d.date));
  const valuesA  = dataA.map(d => d[typeKey]);
  const valuesB  = dataA.map(d => mapB[d.date.slice(5)] ?? null);

  const isBar = true;

  const datasets = [
    {
      label: `${yearA}年 ${label}`,
      data: valuesA,
      backgroundColor: (typeKey === "cedar" ? C.cedar : C.cypress) + "cc",
      borderColor:     typeKey === "cedar" ? C.cedar : C.cypress,
      borderWidth: 0,
      type: "bar",
      spanGaps: true,
    },
    {
      label: `${yearB}年 ${label}（前年）`,
      data: valuesB,
      borderColor:  C.prevYear,
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: valuesB.length > 80 ? 0 : 2,
      tension: 0.35,
      type: "line",
      spanGaps: true,
    },
  ];

  if (compareChart) { compareChart.destroy(); compareChart = null; }

  const ctx = document.getElementById("compareChart").getContext("2d");
  compareChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 700 ? 1.4 : 3.0,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12, maxRotation: 0, color: C.muted, font: { size: 10 } }, grid: { color: "rgba(30,45,90,.6)" } },
        y: { min: 0, max: 4, ticks: { stepSize: 1, callback: v => LEVEL_LABELS[v] ?? v, color: C.muted, font: { size: 10 } }, grid: { color: "rgba(30,45,90,.6)" } },
      },
      plugins: {
        tooltip: {
          backgroundColor: "#111a3a",
          borderColor: "#1e2d5a",
          borderWidth: 1,
          titleColor: C.text,
          bodyColor: C.muted,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return `${ctx.dataset.label}: ${v != null ? LEVEL_LABELS[v] + " (" + v + ")" : "—"}`;
            },
          },
        },
        legend: { labels: { color: C.text, font: { size: 11 }, boxWidth: 12 } },
      },
    },
  });
}

// ---- Diff summary ----
function renderDiffSummary(json) {
  const typeKey = state.compareTypeKey;
  const dataA = json.year_a?.data || [];
  const dataB = json.year_b?.data || [];
  const yearA = json.year_a?.year;
  const yearB = json.year_b?.year;

  const avg = arr => {
    const vals = arr.map(d => d[typeKey]).filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const peak = arr => {
    const vals = arr.map(d => d[typeKey]).filter(v => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const peakDate = arr => {
    const filtered = arr.filter(d => d[typeKey] != null);
    if (!filtered.length) return null;
    return filtered.reduce((a, b) => b[typeKey] > a[typeKey] ? b : a).date;
  };
  const countAbove = (arr, threshold) =>
    arr.filter(d => (d[typeKey] ?? -1) >= threshold).length;

  const avgA = avg(dataA),  avgB = avg(dataB);
  const pkA  = peak(dataA), pkB  = peak(dataB);
  const pkDateA = peakDate(dataA);
  const daysA3 = countAbove(dataA, 3);
  const daysB3 = countAbove(dataB, 3);

  const diffAvg = avgA != null && avgB != null ? (avgA - avgB).toFixed(2) : null;
  const diffPk  = pkA  != null && pkB  != null ? pkA - pkB : null;

  const el = document.getElementById("diffSummary");
  el.innerHTML = "";

  const items = [
    {
      label: `平均レベル (${yearA}年)`,
      val: avgA != null ? avgA.toFixed(2) : "—",
      cls: "",
    },
    {
      label: `平均レベル (${yearB}年)`,
      val: avgB != null ? avgB.toFixed(2) : "—",
      cls: "",
    },
    {
      label: "前年比（平均）",
      val: diffAvg != null
        ? (diffAvg > 0 ? "+" : "") + diffAvg
        : "—",
      cls: diffAvg != null ? (diffAvg > 0 ? "diff-up" : diffAvg < 0 ? "diff-down" : "diff-flat") : "",
    },
    {
      label: `ピーク日 (${yearA}年)`,
      val: pkDateA ? pkDateA.slice(5).replace("-", "/") : "—",
      cls: "",
    },
    {
      label: `レベル3以上の日数 (${yearA}年)`,
      val: daysA3 + " 日",
      cls: "",
    },
    {
      label: `レベル3以上の日数 (${yearB}年)`,
      val: daysB3 + " 日",
      cls: daysA3 > daysB3 ? "diff-up" : daysA3 < daysB3 ? "diff-down" : "diff-flat",
    },
  ];

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "diff-item";
    div.innerHTML = `
      <div class="diff-item-label">${item.label}</div>
      <div class="diff-item-val ${item.cls}">${item.val}</div>
    `;
    el.appendChild(div);
  });
}

// ---- Data table ----
function updateDataTable(data) {
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = "";
  document.getElementById("tableCount").textContent = data.length + "件";

  [...data].reverse().forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${lbadge(row.cedar,   C.cedar,   C.cedar2)}</td>
      <td>${lbadge(row.cypress, C.cypress, C.cypress2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function lbadge(v, col, col2) {
  if (v == null) return '<span style="color:#7986cb">—</span>';
  const bgs  = ["#1b3a1f","#2e2900","#3e2000","#3e1200","#3e0000"];
  const fgs  = ["#69f0ae","#ffe57f","#ffab40","#ff6d00","#ff5252"];
  const bg = bgs[v] || bgs[0];
  const fg = fgs[v] || fgs[0];
  return `<span class="lbadge" style="background:${bg};color:${fg}">${LEVEL_LABELS[v]} (${v})</span>`;
}

// ---- Scrape / Demo ----
async function runScrape() {
  const btn = document.getElementById("scrapeBtn");
  btn.disabled = true;
  btn.textContent = "取得中...";
  showMainLoading("Yahoo天気からスクレイピング中...\n(30秒〜1分かかります)");

  try {
    const res  = await fetch("/api/pollen/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area: state.area }),
    });
    const json = await res.json();
    if (!json.success) {
      toast("エラー: " + (json.error || "不明なエラー"), true);
    } else {
      toast("取得完了: " + json.scraped_at);
      await fetchAnnual();
    }
  } catch (e) {
    toast("通信エラー: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "↻ データ取得";
    hideMainLoading();
  }
}

async function loadDemoData() {
  showMainLoading("デモデータを生成中...");
  try {
    const res  = await fetch("/api/pollen/demo", { method: "POST" });
    const json = await res.json();
    if (json.success) {
      toast("デモデータを生成しました");
      await fetchAnnual();
    }
  } catch (e) {
    toast("失敗: " + e.message, true);
  } finally {
    hideMainLoading();
  }
}

// ---- Helpers ----
function fmtDate(s) {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function showMainLoading(msg) {
  document.getElementById("mainLoadingMsg").textContent = msg;
  document.getElementById("mainLoading").classList.remove("hidden");
}
function hideMainLoading() {
  document.getElementById("mainLoading").classList.add("hidden");
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = document.getElementById("toastMsg");
  el.textContent = msg;
  el.className = "toast" + (isError ? " error" : "");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add("hidden"); }, 4000);
}
