# Contributing to AWS Cloud News Dashboard

Thank you for your interest in contributing to the AWS Cloud News Dashboard! 🎉

This project welcomes contributions from everyone. Whether you're fixing a bug, adding a feature, improving documentation, or suggesting enhancements, your help is appreciated.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Security](#security)

---

## Code of Conduct

This project adheres to a simple code of conduct:
- **Be respectful** and considerate of others
- **Be collaborative** and open to feedback
- **Focus on what's best** for the community and the project

---

## How Can I Contribute?

### 🐛 Reporting Bugs

If you find a bug, please [open an issue](../../issues/new) with:
- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs. actual behavior
- **Screenshots** (if applicable)
- **Environment details** (browser, OS, etc.)

### 💡 Suggesting Enhancements

Have an idea? [Open an issue](../../issues/new) with:
- **Clear description** of the enhancement
- **Use case** or problem it solves
- **Proposed solution** (if you have one)
- **Alternatives** you've considered

### 📝 Improving Documentation

Documentation improvements are always welcome! This includes:
- Fixing typos or unclear wording
- Adding examples or clarifications
- Updating outdated information
- Translating content

### 🔧 Contributing Code

Ready to code? Great! See the [Development Workflow](#development-workflow) section below.

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** (comes with Node.js)
- **Git** for version control

### Fork and Clone

1. **Fork** this repository to your GitHub account
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/awscloudclub-uh-cloud-news.git
   cd awscloudclub-uh-cloud-news
   ```

3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/AgentPierre/awscloudclub-uh-cloud-news.git
   ```

### Install Dependencies

```bash
npm install
```

### Local Development

Open `index.html` in your browser or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server

# Then visit http://localhost:8000
```

### Running the News Fetcher

```bash
npm run update-news
```

This fetches the latest AWS news and updates `news.json`.

---

## Development Workflow

### 1. Create a Branch

Always work on a feature branch, not directly on `main`:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming convention:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `chore/description` - Maintenance tasks

### 2. Make Your Changes

- Write clean, readable code
- Follow the [Coding Standards](#coding-standards)
- Test your changes thoroughly
- Keep commits focused and atomic

### 3. Test Your Changes

Before submitting:
- ✅ Test the UI in multiple browsers (Chrome, Firefox, Safari, Edge)
- ✅ Verify responsive design (mobile, tablet, desktop)
- ✅ Check that `npm run update-news` works
- ✅ Ensure no console errors
- ✅ Verify dark mode styling looks good

### 4. Commit Your Changes

Follow the [Commit Guidelines](#commit-guidelines):

```bash
git add .
git commit -m "feat: add source filtering to news cards"
```

### 5. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

---

## Coding Standards

### JavaScript

- **Use ES6+ features** (const/let, arrow functions, template literals)
- **No frameworks required** - This is a vanilla JS project
- **Prefer functional style** over imperative when appropriate
- **Handle errors gracefully** with try/catch
- **Use meaningful variable names**

```javascript
// Good
const filteredArticles = articles.filter(article => article.source === 'aws-news');

// Avoid
const arr = articles.filter(a => a.src === 'aws-news');
```

### HTML

- **Semantic HTML5** elements
- **Accessible markup** (ARIA labels where appropriate)
- **Valid HTML** (no unclosed tags, proper nesting)

### CSS

- **Mobile-first** responsive design
- **CSS custom properties** for theming
- **BEM-like naming** for classes where appropriate
- **Consistent spacing** (2 spaces for indentation)

### File Organization

```
awscloudclub-uh-cloud-news/
├── index.html          # Main HTML file
├── style.css           # All styles
├── news.json           # Generated news data
├── scripts/
│   ├── app.js          # Client-side logic
│   └── fetch-news.js   # News fetching script
└── .github/
    └── workflows/      # CI/CD workflows
```

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic commit messages.

### Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation only
- **style:** Formatting, missing semicolons, etc. (no code change)
- **refactor:** Code change that neither fixes a bug nor adds a feature
- **perf:** Performance improvement
- **test:** Adding or updating tests
- **chore:** Maintenance tasks, dependencies, build process
- **ci:** CI/CD changes

### Examples

```bash
feat: add filtering by AWS service category
fix: resolve ticker overflow on mobile devices
docs: update README with new RSS sources
chore: upgrade rss-parser to v3.14.0
```

### Footer

Add breaking changes or issue references:

```
feat: redesign card layout

BREAKING CHANGE: Previous card structure no longer supported

Closes #42
```

---

## Pull Request Process

### Before Submitting

- [ ] Code follows the [Coding Standards](#coding-standards)
- [ ] Commits follow [Commit Guidelines](#commit-guidelines)
- [ ] Changes are tested locally
- [ ] No console errors or warnings
- [ ] Documentation is updated (if applicable)
- [ ] Branch is up-to-date with `main`

### PR Template

When creating a pull request, include:

**Description:**
- What changes does this PR introduce?
- Why is this change needed?

**Type of Change:**
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] Documentation update

**Testing:**
- How was this tested?
- What browsers/devices were tested?

**Screenshots:**
- (If applicable) Add before/after screenshots

### Review Process

1. **Automated checks** will run (repo hygiene, future tests)
2. **Maintainer review** - We'll review your code and provide feedback
3. **Requested changes** - Address any feedback
4. **Approval** - Once approved, we'll merge your PR

### After Merging

Your contribution will be:
- 🎉 Merged into `main`
- 🚀 Automatically deployed to GitHub Pages
- 🏆 Credited in the commit history

---

## Security

**Found a security vulnerability?**

Please **do not** open a public issue. Instead, see our [Security Policy](SECURITY.md) for responsible disclosure procedures.

---

## Questions?

- 💬 Open a [discussion](../../discussions)
- 📧 Contact the maintainers
- 🐛 File an [issue](../../issues)

---

## Recognition

Contributors are automatically credited via Git commit history. Thank you for making this project better! 🙌

---

**Happy Contributing!** 🚀
