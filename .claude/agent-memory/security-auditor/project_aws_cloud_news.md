---
name: AWS Cloud News Dashboard — Project Security Profile
description: Architecture, data flows, and security posture of the awscloudclub-uh-cloud-news static dashboard project
type: project
---

Static GitHub Pages site that aggregates official AWS RSS feeds. The build pipeline is a single Node.js script (`scripts/fetch-news.js`) that runs locally (not in CI currently) and writes `news.json`. The HTML page fetches `news.json` at runtime and renders it client-side.

**Why:** Understanding this architecture is critical to scoping any audit — there are no users supplying input to the backend script, and all network requests originate from hardcoded HTTPS URLs.

**How to apply:** When auditing future changes, pay special attention to any feature that introduces dynamic URL construction, user-supplied query parameters, or new dependencies — these would materially change the threat model.

Key facts:
- No server-side runtime; purely static after build
- Single direct dependency: `rss-parser@3.13.0` (MIT) which itself depends on `xml2js@0.5.0`, `sax@1.6.0`, `xmlbuilder@11.0.1`, `entities@2.2.0`
- Feed URLs are all hardcoded to `https://aws.amazon.com` — no user-controlled input reaches network calls
- `node_modules/` is NOT in `.gitignore` and IS currently uploaded to the public GitHub Pages artifact (V-003, HIGH)
- `fetch-news.js` is NOT run in CI; the workflow only deploys static files that exist on disk
- `rss-parser` uses deprecated `url.parse()` and performs no host allowlist check on redirects (V-001, HIGH)
- No authentication, no API keys, no secrets in the codebase
- 15-second timeout is configured on the parser (improvement over library default of 60s)
- `escapeHtml()` is present and used in the browser layer, but does not block `javascript:` URI scheme in `href` attributes (V-006, MEDIUM)
