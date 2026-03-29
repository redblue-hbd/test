document.getElementById("scrapeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await runScrape();
});

function addSelector() {
  const list = document.getElementById("selectorList");
  if (list.children.length >= 5) return;

  const row = document.createElement("div");
  row.className = "selector-row";
  row.innerHTML = `
    <input type="text" class="selector-label" placeholder="ラベル（例: 価格）">
    <input type="text" class="selector-value" placeholder="CSSセレクター（例: .price）">
    <button type="button" class="btn-remove" onclick="removeSelector(this)">×</button>
  `;
  list.appendChild(row);
}

function removeSelector(btn) {
  btn.closest(".selector-row").remove();
}

function getSelectors() {
  const selectors = {};
  document.querySelectorAll(".selector-row").forEach((row) => {
    const label = row.querySelector(".selector-label").value.trim();
    const value = row.querySelector(".selector-value").value.trim();
    if (label && value) selectors[label] = value;
  });
  return selectors;
}

async function runScrape() {
  const url = document.getElementById("urlInput").value.trim();
  const errorEl = document.getElementById("error");
  const loadingEl = document.getElementById("loading");
  const resultsEl = document.getElementById("results");
  const submitBtn = document.getElementById("submitBtn");

  errorEl.classList.add("hidden");
  resultsEl.classList.add("hidden");

  if (!url) {
    showError("URLを入力してください。");
    return;
  }

  submitBtn.disabled = true;
  loadingEl.classList.remove("hidden");

  try {
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, selectors: getSelectors() }),
    });

    const data = await res.json();
    loadingEl.classList.add("hidden");

    if (!res.ok || data.error) {
      showError(data.error || "スクレイピングに失敗しました。");
      return;
    }

    renderResults(data);
  } catch {
    loadingEl.classList.add("hidden");
    showError("サーバーへの接続に失敗しました。");
  } finally {
    submitBtn.disabled = false;
  }
}

function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function renderResults(data) {
  // Basic info
  const tbody = document.querySelector("#basicTable tbody");
  tbody.innerHTML = "";
  const basics = [
    ["URL", data.url],
    ["タイトル", data.title || "—"],
    ["メタ説明", data.meta_description || "—"],
    ["リンク数", data.links.length],
    ["画像数", data.images.length],
    ["見出し数", data.headings.length],
  ];
  basics.forEach(([k, v]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${k}</td><td>${escapeHtml(String(v))}</td>`;
    tbody.appendChild(tr);
  });

  // Custom selectors
  const customSection = document.getElementById("customSection");
  const customResults = document.getElementById("customResults");
  customResults.innerHTML = "";
  const customKeys = Object.keys(data.custom || {});
  if (customKeys.length > 0) {
    customKeys.forEach((key) => {
      const items = data.custom[key];
      const block = document.createElement("div");
      block.className = "custom-block";
      block.innerHTML = `<h3>${escapeHtml(key)}</h3>`;
      if (items.length === 0) {
        block.innerHTML += `<p style="color:#999;font-size:.85rem;">結果なし</p>`;
      } else {
        const ul = document.createElement("ul");
        items.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          ul.appendChild(li);
        });
        block.appendChild(ul);
      }
      customResults.appendChild(block);
    });
    customSection.classList.remove("hidden");
  } else {
    customSection.classList.add("hidden");
  }

  // Headings
  document.getElementById("headingCount").textContent = data.headings.length;
  const headingList = document.getElementById("headingList");
  headingList.innerHTML = "";
  data.headings.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = `[${h.level.toUpperCase()}] ${h.text}`;
    headingList.appendChild(li);
  });

  // Links
  document.getElementById("linkCount").textContent = data.links.length;
  const linkList = document.getElementById("linkList");
  linkList.innerHTML = "";
  data.links.forEach((link) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(link.url)}
      </a>
      <span class="link-text">${escapeHtml(link.text)}</span>
    `;
    linkList.appendChild(li);
  });

  // Images
  document.getElementById("imageCount").textContent = data.images.length;
  const imageGrid = document.getElementById("imageGrid");
  imageGrid.innerHTML = "";
  data.images.forEach((img) => {
    const item = document.createElement("div");
    item.className = "image-item";
    item.innerHTML = `
      <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}"
           onerror="this.style.display='none'">
      <div class="alt-text">${escapeHtml(img.alt) || "—"}</div>
    `;
    imageGrid.appendChild(item);
  });

  document.getElementById("results").classList.remove("hidden");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
