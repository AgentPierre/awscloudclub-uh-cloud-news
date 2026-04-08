const fs = require("fs/promises");
const path = require("path");
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "aws-cloud-news-dashboard/1.0"
  }
});

const FEEDS = [
  {
    source: "AWS What's New",
    url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/"
  },
  {
    source: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/"
  },
  {
    source: "AWS Architecture Blog",
    url: "https://aws.amazon.com/blogs/architecture/feed/"
  },
  {
    source: "AWS Security Blog",
    url: "https://aws.amazon.com/blogs/security/feed/"
  }
];

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    if (url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function toIsoDate(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.updated;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  return (parsed.items || []).map((entry) => {
    const link = normalizeUrl(entry.link || entry.guid);
    return {
      title: (entry.title || "").trim(),
      link,
      source: feed.source,
      pubDate: toIsoDate(entry)
    };
  });
}

async function main() {
  const results = await Promise.all(FEEDS.map((feed) => fetchFeed(feed)));
  const allItems = results.flat().filter((item) => item.title && item.link && item.pubDate);

  const dedupedMap = new Map();
  for (const item of allItems) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const items = Array.from(dedupedMap.values())
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 30);

  const payload = {
    lastUpdated: new Date().toISOString(),
    items
  };

  const outputPath = path.resolve(__dirname, "..", "news.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${items.length} items to ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to fetch AWS RSS feeds:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
