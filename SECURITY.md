# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public GitHub issue. Instead, report it privately so it can be addressed before public disclosure.

**Contact:** Open a [GitHub Security Advisory](https://github.com/AgentPierre/awscloudclub-uh-cloud-news/security/advisories/new) to report a vulnerability confidentially.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any suggested remediation (optional)

You can expect an acknowledgement within **5 business days** and a resolution or status update within **30 days**.

## Security Practices

This project follows these security practices:
- Dependencies are audited on every CI build (`npm audit`)
- GitHub Actions are pinned to specific commit SHAs
- The public GitHub Pages artifact contains only the static site files (`index.html`, `style.css`, `news.json`, `scripts/app.js`) — no server-side code or `node_modules`
- RSS feed sources are limited to official AWS endpoints
