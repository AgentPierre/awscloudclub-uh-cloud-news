const SOURCE_META = {
  "AWS What's New": { className: "source-whatsnew", short: "What's New" },
  "AWS News Blog": { className: "source-news", short: "News Blog" },
  "AWS Architecture Blog": { className: "source-architecture", short: "Architecture" },
  "AWS Security Blog": { className: "source-security", short: "Security" }
};

const state = {
  items: [],
  selectedSource: "All"
};

const tabsEl = document.getElementById("tabs");
const cardsEl = document.getElementById("cards");
const lastUpdatedEl = document.getElementById("lastUpdated");
const breakingNewsTickerTextEl = document.getElementById("breakingNewsTickerText");
const skeletonTemplate = document.getElementById("cardSkeletonTemplate");

function timeAgo(isoDate) {
  const now = new Date();
  const date = new Date(isoDate);
  const diffSec = Math.max(1, Math.floor((now - date) / 1000));
  const units = [
    ["y", 60 * 60 * 24 * 365],
    ["mo", 60 * 60 * 24 * 30],
    ["d", 60 * 60 * 24],
    ["h", 60 * 60],
    ["m", 60],
    ["s", 1]
  ];
  for (const [unit, seconds] of units) {
    const value = Math.floor(diffSec / seconds);
    if (value >= 1) return `${value}${unit} ago`;
  }
  return "just now";
}

function sourceCounts(items) {
  return items.reduce(
    (acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1;
      return acc;
    },
    { All: items.length }
  );
}

function setLoadingSkeletons(count = 8) {
  cardsEl.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    fragment.appendChild(skeletonTemplate.content.cloneNode(true));
  }
  cardsEl.appendChild(fragment);
}

function renderTabs() {
  const counts = sourceCounts(state.items);
  const ordered = ["All", ...Object.keys(SOURCE_META)];

  tabsEl.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const source of ordered) {
    const active = source === state.selectedSource;
    const label = source === "All" ? "All Sources" : SOURCE_META[source].short;

    const btn = document.createElement("button");
    btn.className = "tab" + (active ? " active" : "");
    btn.dataset.source = source;
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(active));

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;

    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = String(counts[source] || 0);

    btn.appendChild(labelSpan);
    btn.appendChild(countSpan);
    fragment.appendChild(btn);
  }

  tabsEl.appendChild(fragment);
}

function renderCards() {
  const filtered =
    state.selectedSource === "All"
      ? state.items
      : state.items.filter((item) => item.source === state.selectedSource);

  if (!filtered.length) {
    cardsEl.replaceChildren();
    const article = document.createElement("article");
    article.className = "empty-state";

    const h2 = document.createElement("h2");
    h2.textContent = "No articles found";

    const p = document.createElement("p");
    p.textContent = "Try selecting another source tab.";

    article.appendChild(h2);
    article.appendChild(p);
    cardsEl.appendChild(article);
    return;
  }

  cardsEl.replaceChildren();
  const fragment = document.createDocumentFragment();

  filtered.forEach((item, idx) => {
    const meta = SOURCE_META[item.source] || { className: "source-default", short: item.source };
    const safeLink = /^https:\/\//i.test(item.link) ? item.link : "#";

    const a = document.createElement("a");
    a.href = safeLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "news-card fade-up";
    a.style.animationDelay = `${Math.min(idx * 35, 350)}ms`;
    a.setAttribute("aria-label", item.title);

    const cardTop = document.createElement("div");
    cardTop.className = "card-top";

    const badge = document.createElement("span");
    badge.className = `source-badge ${meta.className}`;
    badge.textContent = meta.short;

    const externalIndicator = document.createElement("span");
    externalIndicator.className = "external-indicator";
    externalIndicator.setAttribute("aria-hidden", "true");
    externalIndicator.textContent = "↗";

    cardTop.appendChild(badge);
    cardTop.appendChild(externalIndicator);

    const h2 = document.createElement("h2");
    h2.textContent = item.title;

    const p = document.createElement("p");
    p.textContent = item.title;

    const cardMeta = document.createElement("div");
    cardMeta.className = "card-meta";

    const time = document.createElement("time");
    time.setAttribute("datetime", item.pubDate);
    time.textContent = timeAgo(item.pubDate);

    cardMeta.appendChild(time);
    a.appendChild(cardTop);
    a.appendChild(h2);
    a.appendChild(p);
    a.appendChild(cardMeta);
    fragment.appendChild(a);
  });

  cardsEl.appendChild(fragment);
}

function renderAll() {
  renderTabs();
  renderCards();
}

function renderBreakingNewsTicker() {
  if (!breakingNewsTickerTextEl) return;
  if (!state.items.length) {
    breakingNewsTickerTextEl.textContent = "No breaking AWS updates available yet.";
    return;
  }
  const headlines = state.items
    .slice(0, 8)
    .map((item) => String(item.title || "").trim())
    .filter(Boolean);
  const joined = headlines.join(" • ");
  breakingNewsTickerTextEl.textContent = `${joined} • ${joined}`;
}

tabsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-source]");
  if (!btn) return;
  state.selectedSource = btn.getAttribute("data-source");
  renderAll();
});

async function initialize() {
  setLoadingSkeletons();
  try {
    const response = await fetch("./news.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.items = Array.isArray(payload.items) ? payload.items : [];
    if (payload.lastUpdated) {
      const updatedText = new Date(payload.lastUpdated).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      });
      lastUpdatedEl.textContent = `Last updated: ${updatedText}`;
    }
    renderBreakingNewsTicker();
    renderAll();
  } catch {
    cardsEl.replaceChildren();
    const article = document.createElement("article");
    article.className = "empty-state";

    const h2 = document.createElement("h2");
    h2.textContent = "Unable to load news";

    const p = document.createElement("p");
    const code = document.createElement("code");
    code.textContent = "news.json";
    p.append("Check that ", code, " exists and is valid.");

    article.appendChild(h2);
    article.appendChild(p);
    cardsEl.appendChild(article);

    if (breakingNewsTickerTextEl) {
      breakingNewsTickerTextEl.textContent = "Unable to load breaking news headlines.";
    }
    lastUpdatedEl.textContent = "Last updated: unavailable";
  }
}

initialize();
