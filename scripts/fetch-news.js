const fs = require("fs/promises");
const https = require("https");
const path = require("path");
const Parser = require("rss-parser");

const parser = new Parser({
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
  },
  {
    source: "AWS Machine Learning Blog",
    url: "https://aws.amazon.com/blogs/machine-learning/feed/"
  },
  {
    source: "AWS Containers Blog",
    url: "https://aws.amazon.com/blogs/containers/feed/"
  },
  {
    source: "AWS Developer Tools Blog",
    url: "https://aws.amazon.com/blogs/developer/feed/"
  }
];

const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB — V-002: body size limit
const ALLOWED_HOSTNAME = "aws.amazon.com";

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

// V-001: custom transport — never follows redirects
// V-002: enforces MAX_FEED_BYTES cap on response body
// V-005: validates Content-Type before XML parsing
async function fetchRawFeed(feedUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(feedUrl);
    if (parsed.hostname !== ALLOWED_HOSTNAME) {
      reject(new Error(`Blocked: hostname ${parsed.hostname} not in allowlist`));
      return;
    }
    const req = https.get(feedUrl, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        req.destroy();
        reject(new Error(`Redirect not allowed: ${res.statusCode} -> ${res.headers.location}`));
        return;
      }
      if (res.statusCode !== 200) {
        req.destroy();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const contentType = res.headers["content-type"] || "";
      if (
        !contentType.includes("xml") &&
        !contentType.includes("rss") &&
        !contentType.includes("atom")
      ) {
        req.destroy();
        reject(new Error(`Unexpected Content-Type: ${contentType}`));
        return;
      }
      let bytes = 0;
      const chunks = [];
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk, "utf8");
        if (bytes > MAX_FEED_BYTES) {
          req.destroy();
          reject(new Error(`Feed exceeded ${MAX_FEED_BYTES} byte limit`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(chunks.join("")));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

async function fetchFeed(feed) {
  const xml = await fetchRawFeed(feed.url);
  const parsed = await parser.parseString(xml);
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
  // Per-feed error handling: one failing feed does not abort the rest
  const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));

  const allItems = results
    .flatMap((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      console.error(
        `[WARN] Feed "${FEEDS[i].source}" failed: ${result.reason?.message ?? result.reason}`
      );
      return [];
    })
    .filter((item) => item.title && item.link && item.pubDate);

  const failedCount = results.filter((r) => r.status === "rejected").length;
  if (failedCount > 0) {
    console.warn(`[WARN] ${failedCount} of ${FEEDS.length} feeds failed.`);
  }

  const dedupedMap = new Map();
  for (const item of allItems) {
    if (!dedupedMap.has(item.link)) {
      dedupedMap.set(item.link, item);
    }
  }

  const items = Array.from(dedupedMap.values())
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 60);

  const payload = {
    lastUpdated: new Date().toISOString(),
    items
  };

  const outputPath = path.resolve(__dirname, "..", "news.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${items.length} items to ${outputPath}`);
}

main().catch((error) => {
  console.error(
    "Failed to fetch AWS RSS feeds:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
