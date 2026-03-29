// ---- State ----
let allData = [];
let chart = null;
let currentYear = new Date().getFullYear();
let currentType = "both";    // "both" | "cedar" | "cypress"
let currentChart = "line";   // "line" | "bar"
let currentMonth = "all";    // "all" | "1"..."6"

const LEVEL_LABELS = ["なし", "少ない", "やや多い", "多い", "非常に多い"];
const LEVEL_COLORS_CEDAR   = "rgba(255, 112, 67, 1)";
const LEVEL_COLORS_CYPRESS = "rgba(66, 165, 245, 1)";
const LEVEL_BG_CEDAR       = "rgba(255, 112, 67, 0.15)";
const LEVEL_BG_CYPRESS     = "rgba(66, 165, 245, 0.15)";

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  // トグルボタンの初期化
  document.querySelectorAll(".toggle-btn[data-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-btn[data-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      renderChart();
    });
  });

  document.querySelectorAll(".toggle-btn[data-chart]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-btn[data-chart]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentChart = btn.dataset.chart;
      rebuildChart();
    });
  });

  document.getElementById("yearSelect").addEventListener("change", e => {
    currentYear = parseInt(e.target.value);
    fetchAnnualData();
  });

  document.getElementById("monthFilter").addEventListener("change", e => {
    currentMonth = e.target.value;
    renderChart();
  });

  fetchAnnualData();
});

// ---- API calls ----
async function fetchAnnualData() {
  showLoading("データを読み込み中...");
  try {
    const res = await fetch(`/api/pollen/annual?year=${currentYear}`);
    const json = await res.json();

    // 年セレクト更新
    const sel = document.getElementById("yearSelect");
    const prevYear = sel.value;
    sel.innerHTML = "";
    (json.available_years || [currentYear]).forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = `${y}年`;
      if (y === currentYear) opt.selected = true;
      sel.appendChild(opt);
    });

    // 最終更新
    if (json.latest_update) {
      document.getElementById("lastUpdate").textContent =
        "最終更新: " + json.latest_update.replace("T", " ").slice(0, 16);
    }

    allData = json.data || [];

    if (allData.length === 0) {
      showError("データがありません。「最新データ取得」またはまずは「デモデータ」をお試しください。");
    } else {
      hideError();
    }

    updateSummary();
    rebuildChart();
  } catch (e) {
    showError("データの読み込みに失敗しました: " + e.message);
  } finally {
    hideLoading();
  }
}

async function runScrape() {
  const btn = document.getElementById("scrapeBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⟳</span> 取得中...';
  showLoading("Yahoo天気からデータを取得中...\n(30秒〜1分かかる場合があります)");
  hideError();

  try {
    const res = await fetch("/api/pollen/scrape", { method: "POST" });
    const json = await res.json();
    if (!json.success) {
      showError("スクレイピングエラー: " + (json.error || "不明なエラー"));
    } else {
      await fetchAnnualData();
    }
  } catch (e) {
    showError("通信エラー: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">↻</span> 最新データ取得';
    hideLoading();
  }
}

async function loadDemoData() {
  showLoading("デモデータを生成中...");
  hideError();
  try {
    const res = await fetch("/api/pollen/demo", { method: "POST" });
    const json = await res.json();
    if (json.success) {
      await fetchAnnualData();
    }
  } catch (e) {
    showError("デモデータの生成に失敗しました: " + e.message);
    hideLoading();
  }
}

// ---- Chart ----
function getFilteredData() {
  if (currentMonth === "all") return allData;
  const m = parseInt(currentMonth);
  return allData.filter(d => {
    const month = parseInt(d.date.slice(5, 7));
    if (m === 6) return month >= 6;
    return month === m;
  });
}

function rebuildChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
  renderChart();
}

function renderChart() {
  const filtered = getFilteredData();
  const labels = filtered.map(d => formatDate(d.date));

  const datasets = [];

  if (currentType === "both" || currentType === "cedar") {
    datasets.push({
      label: "スギ花粉",
      data: filtered.map(d => d.cedar),
      borderColor: LEVEL_COLORS_CEDAR,
      backgroundColor: currentChart === "bar" ? LEVEL_COLORS_CEDAR : LEVEL_BG_CEDAR,
      borderWidth: currentChart === "line" ? 2 : 0,
      fill: currentChart === "line",
      tension: 0.35,
      pointRadius: filtered.length > 60 ? 0 : 3,
      pointHoverRadius: 5,
      spanGaps: true,
    });
  }

  if (currentType === "both" || currentType === "cypress") {
    datasets.push({
      label: "ヒノキ花粉",
      data: filtered.map(d => d.cypress),
      borderColor: LEVEL_COLORS_CYPRESS,
      backgroundColor: currentChart === "bar" ? LEVEL_COLORS_CYPRESS : LEVEL_BG_CYPRESS,
      borderWidth: currentChart === "line" ? 2 : 0,
      fill: currentChart === "line",
      tension: 0.35,
      pointRadius: filtered.length > 60 ? 0 : 3,
      pointHoverRadius: 5,
      spanGaps: true,
    });
  }

  const ctx = document.getElementById("pollenChart").getContext("2d");

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
    return;
  }

  chart = new Chart(ctx, {
    type: currentChart,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 640 ? 1.4 : 2.5,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 12,
            maxRotation: 0,
            font: { size: 11 },
          },
          grid: { color: "rgba(0,0,0,.04)" },
        },
        y: {
          min: 0,
          max: 4,
          ticks: {
            stepSize: 1,
            callback: v => LEVEL_LABELS[v] ?? v,
            font: { size: 11 },
          },
          grid: { color: "rgba(0,0,0,.06)" },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              const label = v != null ? `${LEVEL_LABELS[v] ?? v} (${v})` : "データなし";
              return `${ctx.dataset.label}: ${label}`;
            },
          },
        },
        legend: {
          position: "top",
          labels: { font: { size: 12 }, boxWidth: 14 },
        },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x",
          },
        },
      },
    },
  });

  updateDataTable(filtered);
}

function resetZoom() {
  if (chart) chart.resetZoom();
}

// ---- Summary ----
function updateSummary() {
  const data = allData;
  document.getElementById("totalDays").textContent = data.length + " 日";

  const cedarData = data.filter(d => d.cedar != null);
  const cypressData = data.filter(d => d.cypress != null);

  if (cedarData.length) {
    const peak = cedarData.reduce((a, b) => (b.cedar > a.cedar ? b : a));
    document.getElementById("cedarPeak").textContent =
      LEVEL_LABELS[peak.cedar] + ` (${peak.cedar})`;
    document.getElementById("cedarPeakDate").textContent = formatDate(peak.date);

    const avg = cedarData.reduce((s, d) => s + d.cedar, 0) / cedarData.length;
    document.getElementById("cedarAvg").textContent = avg.toFixed(1);
  }

  if (cypressData.length) {
    const peak = cypressData.reduce((a, b) => (b.cypress > a.cypress ? b : a));
    document.getElementById("cypressPeak").textContent =
      LEVEL_LABELS[peak.cypress] + ` (${peak.cypress})`;
    document.getElementById("cypressPeakDate").textContent = formatDate(peak.date);
  }
}

// ---- Data Table ----
function updateDataTable(data) {
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = "";

  [...data].reverse().forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${levelBadge(row.cedar, "cedar")}</td>
      <td>${levelBadge(row.cypress, "cypress")}</td>
    `;
    tbody.appendChild(tr);
  });
}

function levelBadge(v, type) {
  if (v == null) return '<span style="color:#ccc">—</span>';
  const colors = {
    0: "#e8f5e9:#2e7d32",
    1: "#fff9c4:#f57f17",
    2: "#ffe0b2:#e65100",
    3: "#ffccbc:#bf360c",
    4: "#ef9a9a:#b71c1c",
  };
  const [bg, fg] = (colors[v] || "#eee:#333").split(":");
  return `<span class="level-badge" style="background:${bg};color:${fg}">${LEVEL_LABELS[v]} (${v})</span>`;
}

// ---- Helpers ----
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function showLoading(msg) {
  document.getElementById("loadingMsg").textContent = msg;
  document.getElementById("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError() {
  document.getElementById("errorMsg").classList.add("hidden");
}
