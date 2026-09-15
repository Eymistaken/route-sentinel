# Route Sentinel Chromium Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a dependency-free Chromium extension that replaces matching Manifest and CRUSH YouTube destinations with a local 404 page before playback.

**Architecture:** A Manifest V3 content script runs at `document_start`, uses a pure CommonJS/browser-compatible matcher, observes only unresolved video pages, and handles YouTube single-page navigation. A shell build script validates and zips the extension directory without adding a nested directory.

**Tech Stack:** Chromium Manifest V3, browser JavaScript, Node.js built-in test runner, POSIX shell, Info-ZIP, GitHub Actions.

---

### Task 1: Pure Filter Rules

**Files:**
- Create: `src/filter.js`
- Create: `tests/filter.test.js`

- [ ] **Step 1: Write failing tests for URLs, keywords, channels, and player metadata**

Use `node:test` and `node:assert/strict`. Cover exact YouTube host validation, `/watch`, `/shorts`, `/live`, `/embed`, `youtu.be`, both official handles and channel IDs, case-insensitive `manifest` and `crush` substring matches, unrelated titles, malformed JSON, and a representative `videoDetails` object.

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const filter = require("../src/filter.js");

test("matches configured keywords without case sensitivity", () => {
  assert.equal(filter.matchesBlockedKeyword("MANIFEST live"), true);
  assert.equal(filter.matchesBlockedKeyword("CrUsH reaction"), true);
  assert.equal(filter.matchesBlockedKeyword("unrelated music"), false);
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run: `node --test tests/filter.test.js`

Expected: FAIL because `src/filter.js` does not exist.

- [ ] **Step 3: Implement the pure filter module**

Expose the same frozen API through `module.exports` in Node and `globalThis.RouteSentinelFilter` in Chromium. Implement these functions with no external state:

```js
parseUrl(input)
isYouTubeUrl(input)
isVideoUrl(input)
isKnownChannelUrl(input)
matchesBlockedKeyword(value)
shouldBlockMetadata(metadata)
extractPlayerMetadata(scriptText)
```

Use these immutable rule values:

```js
const BLOCKED_KEYWORDS = Object.freeze(["manifest", "crush"]);
const BLOCKED_CHANNEL_IDS = new Set([
  "UC3aqBnkDAfMh5eUmiYi_tfQ",
  "UCdKIMZMJeZtLwitpv0O_U3Q",
]);
const BLOCKED_CHANNEL_HANDLES = new Set([
  "@m6nifestgirls",
  "@wearecrushboys",
]);
```

Extract only a bounded JSON object following the `"videoDetails":` marker. Walk braces while respecting quoted strings and escapes, reject input over 2 MiB, then call `JSON.parse` inside `try/catch`. Never use `eval` or `Function`.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/filter.test.js`

Expected: all filter tests PASS.

- [ ] **Step 5: Commit the pure filter**

```bash
git add src/filter.js tests/filter.test.js
git commit -m "feat: add YouTube content matching rules"
```

### Task 2: Chromium Runtime and Blocked Page

**Files:**
- Create: `src/manifest.json`
- Create: `src/content.js`
- Create: `src/blocked.html`
- Create: `src/blocked.css`

- [ ] **Step 1: Add the minimal Manifest V3 declaration**

Declare only YouTube match patterns, run `filter.js` before `content.js` at `document_start`, restrict execution to the top frame, and expose only the local blocked page assets to the same YouTube origins.

```json
{
  "manifest_version": 3,
  "name": "Route Sentinel",
  "version": "1.0.0",
  "description": "Stops selected YouTube destinations before playback.",
  "content_scripts": [{
    "matches": ["*://*.youtube.com/*", "*://youtu.be/*"],
    "js": ["filter.js", "content.js"],
    "run_at": "document_start",
    "all_frames": false
  }],
  "web_accessible_resources": [{
    "resources": ["blocked.html", "blocked.css"],
    "matches": ["*://*.youtube.com/*", "*://youtu.be/*"]
  }]
}
```

- [ ] **Step 2: Implement the early document guard**

`content.js` must immediately block known channel URLs, evaluate early metadata on video URLs, inspect each script node at most once, and disconnect its `MutationObserver` after a decision or 12 seconds. Before redirecting, call `window.stop()`, pause each media element, remove its `src`, call `load()`, and navigate with `location.replace(chrome.runtime.getURL("blocked.html"))`.

Listen for `yt-navigate-start`, `yt-navigate-finish`, `popstate`, and captured link clicks. Reset inspection on URL changes. A captured link whose visible title or surrounding channel URL already matches must be canceled and blocked before YouTube handles the click.

- [ ] **Step 3: Add a self-contained generic error page**

Use local HTML and CSS only. Render fixed text with no scripts, network resources, explanation, or mention of blocked artists:

```html
<main>
  <p class="code">404</p>
  <h1>Page not found</h1>
</main>
```

- [ ] **Step 4: Validate source syntax and manifest JSON**

Run:

```bash
node --check src/filter.js
node --check src/content.js
node -e 'JSON.parse(require("node:fs").readFileSync("src/manifest.json", "utf8"))'
```

Expected: exit status 0 with no output.

- [ ] **Step 5: Commit the runtime**

```bash
git add src/manifest.json src/content.js src/blocked.html src/blocked.css
git commit -m "feat: stop matching YouTube destinations"
```

### Task 3: Reproducible Build and Continuous Integration

**Files:**
- Create: `package.json`
- Create: `scripts/build.sh`
- Create: `.gitignore`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add dependency-free project commands**

Define `npm test` as `node --test` and `npm run build` as `sh scripts/build.sh`. Do not add runtime or development dependencies.

- [ ] **Step 2: Implement a clean ZIP build**

The script must read the version from `src/manifest.json`, recreate `dist/route-sentinel-chromium-vVERSION`, copy only extension runtime files, validate copied JSON, and create `dist/route-sentinel-chromium-vVERSION.zip` with `manifest.json` at the archive root.

- [ ] **Step 3: Add GitHub Actions checks**

On pushes and pull requests, use Node 22 to run `npm test` and `npm run build`, then upload the ZIP artifact. On `v*` tags, attach the ZIP to a GitHub Release using the built-in `GITHUB_TOKEN`.

- [ ] **Step 4: Run tests and inspect the archive**

Run:

```bash
npm test
npm run build
unzip -l dist/route-sentinel-chromium-v1.0.0.zip
```

Expected: all tests PASS; the archive root lists `manifest.json`, `filter.js`, `content.js`, `blocked.html`, and `blocked.css`.

- [ ] **Step 5: Commit build automation**

```bash
git add package.json scripts/build.sh .gitignore .github/workflows/release.yml
git commit -m "build: package Chromium extension releases"
```

### Task 4: Public Documentation and License

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Add the GPL-3.0 license**

Copy the unmodified GNU General Public License version 3 text into `LICENSE`. Add `GPL-3.0-only` as the package license and use matching SPDX identifiers where source headers are present.

- [ ] **Step 2: Write the README**

Document the exact blocking rules, verified official handles and channel IDs, early-load limitation, lack of telemetry, supported Chromium/Linux scope, ZIP build command, unpacked installation steps, persistence across browser restarts, update steps, complete removal steps, development commands, and GPL-3.0 licensing. State explicitly that the ZIP must be extracted before selecting **Load unpacked**.

- [ ] **Step 3: Check American English and stale scope**

Run:

```bash
rg -n -i '\b(colour|centre|behaviour|neighbour|grey|catalogue|dialogue|defence|licence|analyse|optimise|customise)\b' README.md src tests scripts .github package.json
rg -n -i '\b(Firefox|Debian package|systemd|\.deb)\b' README.md src tests package.json
```

Expected: no British spellings; any Firefox or Debian references appear only in an explicit out-of-scope statement.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md LICENSE package.json
git commit -m "docs: add installation and removal guide"
```

### Task 5: Final Verification and Public Repository

**Files:**
- Modify only files implicated by verification failures.

- [ ] **Step 1: Run the complete local verification**

Run:

```bash
npm test
npm run build
node --check src/filter.js
node --check src/content.js
unzip -t dist/route-sentinel-chromium-v1.0.0.zip
git diff --check
git status --short
```

Expected: tests pass, build succeeds, syntax is valid, ZIP integrity is OK, no whitespace errors exist, and only the ignored `dist/` directory remains untracked or ignored.

- [ ] **Step 2: Review the change before publishing**

Use the code-review-and-quality checklist to inspect correctness, security, performance, maintainability, browser compatibility, test quality, and documentation. Fix and re-run only the checks affected by any finding.

- [ ] **Step 3: Create and push the public GitHub repository**

Rename the local branch to `main`, confirm GitHub CLI authentication, create a public repository named `route-sentinel`, set the current directory as its source, and push the branch:

```bash
git branch -M main
gh auth status
gh repo create route-sentinel --public --source=. --remote=origin --push
```

Expected: GitHub returns the public repository URL and `main` tracks `origin/main`.
