---
name: Recurring Security Anti-Patterns — fetch-news.js Audit
description: Vulnerability patterns and anti-patterns identified in the awscloudclub-uh-cloud-news codebase for regression tracking
type: project
---

The following patterns were identified during the 2026-04-07 audit of `scripts/fetch-news.js`, `index.html`, `.github/workflows/deploy.yml`, and the `rss-parser` dependency tree.

**Why:** Recording these for regression tracking so future audits can quickly check whether previously identified issues have been remediated.

**How to apply:** When reviewing PRs or new code in this repo, run a quick check against each pattern below before signing off.

## Open Vulnerabilities (as of 2026-04-07)

| ID    | Pattern                                     | File / Line                              | Status |
|-------|---------------------------------------------|------------------------------------------|--------|
| V-001 | SSRF via unvalidated redirect in rss-parser | `rss-parser/lib/parser.js` L84           | Open   |
| V-002 | Unbounded response body accumulation        | `rss-parser/lib/parser.js` L92-94        | Open   |
| V-003 | `node_modules/` published to GitHub Pages  | `.github/workflows/deploy.yml` L31       | Open   |
| V-004 | `url.parse()` deprecated API in dependency  | `rss-parser/lib/parser.js` L74           | Open   |
| V-005 | No Content-Type validation on RSS responses | `fetch-news.js` L54                      | Open   |
| V-006 | `javascript:` URI not blocked in `href`     | `fetch-news.js` L56 / `index.html` L161  | Open   |
| V-007 | No SRI on Google Fonts stylesheet           | `index.html` L10-13                      | Open   |
| V-008 | `innerHTML` with feed data (manual escaping)| `index.html` L121, L156                  | Open   |
| V-009 | Raw error object logged to stderr           | `fetch-news.js` L93                      | Open   |
| V-010 | No `npm ci` enforcement in CI               | `.github/workflows/deploy.yml`           | Open   |

## Anti-Patterns to Watch For

1. **Scheme-blind URL normalization** — `normalizeUrl()` uses `new URL()` for structural parsing but does not reject non-HTTPS schemes. Any URL field from an external source must be scheme-checked before storage or DOM insertion.

2. **innerHTML with manual escaping** — The codebase uses `innerHTML` + `escapeHtml()` rather than DOM API methods. This pattern is safe only while every interpolated value is remembered to be escaped. New fields added to card templates should be reviewed for missing `escapeHtml()` calls.

3. **Redirect-following without allowlist** — `rss-parser` follows HTTP redirects to any host. This is the primary SSRF vector. Any upgrade or replacement of this library should be checked for allowlist support.

4. **Artifact over-inclusion** — The GitHub Actions deploy step uses `path: .` (repo root). This pattern will re-expose `node_modules/` whenever the directory exists on the runner disk.

## Positive Security Patterns (Do Not Remove)

- `rel="noopener noreferrer"` on all external `<a>` tags in `index.html`
- `escapeHtml()` defined and applied to `title`, `source`, `pubDate`, `link` before DOM insertion
- 15-second request timeout on the RSS parser (overrides 60s library default)
- Top-level `.catch()` with `process.exit(1)` — no unhandled promise rejections
- `Promise.all()` for concurrent feed fetching with per-feed error isolation path (feeds are independent)
- `cache: "no-store"` on the browser-side `fetch("./news.json")` call
