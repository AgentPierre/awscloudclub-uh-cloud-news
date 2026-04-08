# ☁️ AWS Cloud News Dashboard

> A fully automated, security-hardened static news dashboard for AWS — deployed to GitHub Pages and updated every day by GitHub Actions.

**Live site:** https://agentpierre.github.io/awscloudclub-uh-cloud-news/

---

## 📋 Table of Contents

- [What This Project Does](#what-this-project-does)
- [Architecture Overview](#architecture-overview)
- [Project Journey](#project-journey)
- [GitHub Actions — What I Learned](#github-actions--what-i-learned)
- [GitHub Copilot Coding Agent — What I Learned](#github-copilot-coding-agent--what-i-learned)
- [Security Practices](#security-practices)
- [File Structure](#file-structure)
- [Running Locally](#running-locally)
- [Lessons Learned (LinkedIn Retrospective)](#lessons-learned-linkedin-retrospective)

---

## What This Project Does

This is a **static single-page application** that:

1. **Fetches** the latest news from four official AWS RSS feeds:
   - [AWS What's New](https://aws.amazon.com/about-aws/whats-new/recent/feed/)
   - [AWS News Blog](https://aws.amazon.com/blogs/aws/feed/)
   - [AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/feed/)
   - [AWS Security Blog](https://aws.amazon.com/blogs/security/feed/)

2. **Stores** up to 30 de-duplicated, date-sorted articles in `news.json`

3. **Displays** them in a responsive card grid with a breaking-news ticker, source filter tabs, and relative time stamps

4. **Auto-refreshes** every day at midnight UTC via a scheduled GitHub Actions workflow, committing the new `news.json` back to the repository, which then triggers a fresh deploy

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   GitHub Repository                    │
│                                                        │
│  index.html  ←  static HTML shell                     │
│  style.css   ←  responsive dark-mode CSS              │
│  scripts/                                              │
│    app.js        ←  client-side render logic          │
│    fetch-news.js ←  Node.js RSS fetcher (CI only)     │
│  news.json   ←  pre-built feed snapshot (committed)   │
│  .github/workflows/                                    │
│    deploy.yml      ←  build + deploy to Pages         │
│    update-news.yml ←  daily RSS refresh               │
└──────────────┬──────────────────────────────┬─────────┘
               │                              │
    ┌──────────▼──────────┐       ┌──────────▼──────────┐
    │  GitHub Pages CDN   │       │  AWS RSS Feeds      │
    │  (static hosting)   │       │  aws.amazon.com     │
    └─────────────────────┘       └─────────────────────┘
```

**No server. No database. No runtime cost.** The entire site is pre-built static files.

---

## Project Journey

This project was built incrementally through 4 pull requests, each teaching a new concept:

### Commit 1 — Initial Site (`9a47c66`)
Created the base application:
- `index.html` — semantic HTML shell with CSP meta tag
- `style.css` — dark-mode responsive grid with animations
- `scripts/app.js` — client-side fetch + render logic
- `scripts/fetch-news.js` — Node.js RSS aggregator
- `.github/workflows/deploy.yml` — first GitHub Actions workflow

### Commit 2 — Daily Automation (`ac7c08c`)
Added `update-news.yml` — a **scheduled** GitHub Actions workflow that runs at 12:03 AM UTC every day, fetches the latest RSS items, and commits the updated `news.json` automatically.

### Pull Request #1 — Bug Fix + CI Improvement
**Branch:** `copilot/vscode-mnplltro-q4mw`  
**What broke:** The deployed site was blank — `scripts/app.js` was never copied into the build artifact.

**Fixes applied by the GitHub Copilot Coding Agent:**
- Added `mkdir -p dist/scripts` and `cp scripts/app.js dist/scripts/`
- Split the single monolithic `deploy` job into separate `build` and `deploy` jobs (GitHub Pages best practice)
- Added `workflow_dispatch` trigger for manual re-deploys from the Actions tab
- Added `cache: "npm"` to `actions/setup-node` for faster CI runs

### Pull Request #2 — Security Audit & Hardening
**Branch:** `copilot/security-audit-code-base`  
**Prompt used:** _"Review the code base and make sure to do a security audit"_

The Copilot Coding Agent performed a full audit and resolved these findings:

| ID | Finding | Fix |
|----|---------|-----|
| V-001 | SSRF via RSS redirect | Custom `fetchRawFeed()` blocks all 3xx responses |
| V-002 | Unbounded RSS body size | 5 MB byte cap with streaming counter |
| V-003 | Server secrets in artifact | `deploy.yml` copies only `dist/` (no `node_modules`) |
| V-005 | Unvalidated Content-Type | Checked against `xml/rss/atom` allowlist before parsing |
| V-006 | Non-HTTPS links rendered | `normalizeUrl()` rejects non-`https:` + `safeLink` guard in `app.js` |
| V-007 | Referrer leakage | Added `Referrer-Policy: no-referrer` meta tag |
| V-007 | Browser API abuse | Added `Permissions-Policy` to disable camera/mic/geo/FLoC |
| V-008 | XSS via innerHTML | `app.js` uses DOM API exclusively — no `innerHTML` with feed data |
| V-010 | Vulnerable npm packages | Added `npm audit --audit-level=moderate` step to both workflows |
| V-011 | Actions supply-chain risk | All `uses:` directives pinned to immutable commit SHAs |

### Pull Request #3 — Security Audit Documentation
**Branch:** `pr/copilot-swe-agent/1`  
Added a detailed internal security audit document to `SECURITY.md`.

### Pull Request #4 — Public Security Policy
**Branch:** `copilot/add-security-md-to-public`  
**Prompt used:** _"Should security.md be pushed into the public?"_

The internal audit report was replaced with a proper **GitHub Security Policy** — the standard format GitHub surfaces at `/security/policy` for responsible vulnerability disclosure.

---

## GitHub Actions — What I Learned

Before this project, I had never used GitHub Actions. Here's what I now know:

### Workflows live in `.github/workflows/`
Every YAML file in that directory is a separate **workflow** that GitHub reads automatically. No registration required.

### Triggers (`on:`)
```yaml
on:
  push:
    branches: [main]      # runs when you push to main
  schedule:
    - cron: '3 0 * * *'  # runs every day at 00:03 UTC
  workflow_dispatch:       # adds a "Run workflow" button in the Actions tab
```

### Jobs and Steps
- A **workflow** contains one or more **jobs**
- Jobs run in **parallel by default** — use `needs:` to make one wait for another
- Each job runs on a **fresh virtual machine** (`ubuntu-latest`)
- A job contains sequential **steps** (each step is either a `run:` shell command or a `uses:` action)

### The Deploy Pattern (GitHub Pages)
```
build job:
  1. Checkout code
  2. Install Node.js
  3. Install dependencies (npm ci)
  4. Run the RSS fetcher (node scripts/fetch-news.js)
  5. Copy site files into dist/
  6. Upload dist/ as a "Pages artifact"

deploy job (needs: build):
  1. Download the artifact
  2. Push it to GitHub Pages CDN
```

### Pinning Actions to SHAs
Instead of `uses: actions/checkout@v4` (which could be silently updated), we pin to the exact commit:
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```
This eliminates supply-chain risk — a compromised action tag can't affect your workflow.

### Automated Commits from CI
The `update-news.yml` workflow commits back to the repo:
```bash
git config user.name "github-actions[bot]"
git add news.json
git diff --staged --quiet || git commit -m "chore: refresh news.json [bot]"
git push
```
`git diff --staged --quiet` exits with code 0 when nothing changed (skipping the commit) and with a non-zero code when there are staged changes (triggering the commit via `||`) — keeping a clean history.

---

## GitHub Copilot Coding Agent — What I Learned

The **GitHub Copilot Coding Agent** is an AI assistant that works like a real pull request author:

1. You write a prompt describing what you want (in GitHub Copilot Chat in VS Code)
2. The agent spins up in a cloud environment with a full checkout of your repo
3. It explores the codebase, writes code changes, runs tests, and opens a PR
4. You review the PR diff, leave comments, and merge — just like reviewing a human contributor

### Key Differences from Chat Completions

| | Regular Copilot Chat | Copilot Coding Agent |
|---|---|---|
| Where it runs | Your local machine | Cloud VM |
| What it can do | Answer questions, suggest code | Read/write files, run commands, open PRs |
| Output | Code suggestions | Full pull requests with diffs |
| How long it takes | Seconds | Minutes |

### How Each PR Was Made
Every PR in this project (`#1` through `#4`) was created by typing a prompt like:
- _"delegate the tasks in deploying the website and making sure everything works"_ → PR #1
- _"Review the code base and make sure to do a security audit"_ → PR #2
- _"Should security.md be pushed into the public?"_ → PR #4

The agent read all the source files, reasoned about the problem, made targeted changes, and opened a pull request with a descriptive title and body explaining every change.

### Firewall Restrictions
Cloud agents run in an isolated network. During the security audit (PR #2), the agent reported:
> _"Firewall rules blocked me from connecting to `api.github.com` to resolve SHA hashes for Actions tags"_

This is expected — the agent correctly reported what it couldn't do and used pre-known SHAs instead. You can configure allowed hostnames in the repository's Copilot settings if needed.

---

## Security Practices

| Practice | Implementation |
|----------|---------------|
| **Dependency auditing** | `npm audit --audit-level=moderate` runs on every CI build |
| **Actions SHA pinning** | All `uses:` directives are pinned to immutable commit hashes |
| **No secrets in artifact** | Only `index.html`, `style.css`, `news.json`, `scripts/app.js` are deployed |
| **Content Security Policy** | `<meta http-equiv="Content-Security-Policy" ...>` blocks inline scripts, restricts origins |
| **Referrer Policy** | `no-referrer` — the GitHub Pages origin doesn't leak to outbound links |
| **Permissions Policy** | Camera, microphone, geolocation, and FLoC disabled |
| **XSS prevention** | All DOM updates use the DOM API — no `innerHTML` with untrusted feed data |
| **SSRF prevention** | Custom `fetchRawFeed()` blocks redirects and validates hostname allowlist |
| **Body size limit** | RSS response capped at 5 MB to prevent memory exhaustion |
| **HTTPS-only links** | `normalizeUrl()` rejects non-`https:` URLs before they reach the UI |
| **Responsible disclosure** | `SECURITY.md` provides a GitHub Security Advisory link for private reports |

---

## File Structure

```
.
├── index.html                  # HTML shell (CSP, meta tags, layout)
├── style.css                   # Dark-mode responsive styles
├── news.json                   # Pre-built RSS snapshot (auto-updated by CI)
├── package.json                # Node.js project metadata
├── SECURITY.md                 # Public security / vulnerability disclosure policy
├── scripts/
│   ├── app.js                  # Client-side: fetch news.json, render cards & ticker
│   └── fetch-news.js           # Server-side (CI only): parse RSS, write news.json
└── .github/
    └── workflows/
        ├── deploy.yml          # Build + deploy to GitHub Pages on push to main
        └── update-news.yml     # Daily cron: refresh news.json and commit
```

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/AgentPierre/awscloudclub-uh-cloud-news.git
cd awscloudclub-uh-cloud-news

# Install dependencies
npm install

# Fetch the latest news (writes news.json)
npm run update-news

# Serve the site locally (any static server works)
npx serve .
# or: python3 -m http.server 8080
```

Open `http://localhost:3000` (or `:8080`) to see the dashboard.

---

## Lessons Learned (LinkedIn Retrospective)

> This section is a candid recap of the full journey — suitable for sharing as a learning experience.

### 🚀 What I Built

A real, production-grade cloud news aggregator:
- Static site architecture (zero server cost)
- Automated daily CI/CD pipeline
- Security-hardened from day one

### 📚 Top 5 Things I Learned

**1. GitHub Actions is just YAML + virtual machines**  
I was intimidated by CI/CD before this. It turns out it's just: "when X happens, run these shell commands on a temporary Linux box." Once that clicked, everything made sense.

**2. Separating build and deploy jobs is a best practice**  
The first version had a single job doing everything. Splitting into `build` (assemble the artifact) and `deploy` (push to CDN) gives you better logs, clearer error attribution, and matches how professional pipelines are structured.

**3. Scheduled workflows + auto-commit = truly automated apps**  
`schedule: cron: '3 0 * * *'` runs every single night without me touching anything. Combined with `git push` at the end of the workflow, the site updates itself. This is the "set it and forget it" power of GitHub Actions.

**4. GitHub Copilot Coding Agent is a genuine force multiplier**  
I used it to find and fix a deployment bug I didn't even know existed (`app.js` missing from the artifact), run a comprehensive security audit across 11 vulnerability classes, and make surgical code changes — all through natural language prompts. It opens real PRs that I can review and merge, which means I stay in control while the agent does the heavy lifting.

**5. Security isn't an afterthought — it's a checklist**  
Before this project I would not have known to: pin GitHub Actions to SHAs, cap RSS response body size, validate `Content-Type` before parsing XML, or use the DOM API instead of `innerHTML`. Having an AI agent do a structured audit surfaced all of these in one pass.

### 🔁 The Workflow That Changed How I Think About Projects

```
Idea → Build → GitHub Actions → AI Agent review → Merge → Auto-deploy → Repeat
```

Every change goes through a PR. Every PR is reviewed (by me and/or the agent). Every merge triggers CI. The site is always in a known-good state.

### What's Next

- Add article descriptions/summaries to `news.json` and display them on the cards
- Add a search bar powered by simple client-side filtering
- Explore AWS Amplify Hosting or S3+CloudFront as an alternative to GitHub Pages
- Try GitHub Actions with AWS CLI to automate infrastructure deployments
