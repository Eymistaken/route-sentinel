# YouTube 404 Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every blocked destination to YouTube's authentic 404 page in the same tab.

**Architecture:** Keep all existing matching and media-stopping behavior. Replace the extension-page navigation with `location.replace("https://www.youtube.com/404")`, remove the now-unused local page, and reduce the manifest and archive to runtime essentials.

**Tech Stack:** Chromium Manifest V3, JavaScript, HTML metadata inspection, Node.js built-in test runner, POSIX shell, Info-ZIP

---

### Task 1: Lock Down the Redirect Boundary

**Files:**
- Create: `tests/content.test.js`
- Modify: `tests/filter.test.js`

- [ ] **Step 1: Add a regression assertion**

Add these assertions to the supported-destination test:

```js
assert.equal(filter.isYouTubeUrl("https://www.youtube.com/404"), true);
assert.equal(filter.isVideoUrl("https://www.youtube.com/404"), false);
assert.equal(filter.isKnownChannelUrl("https://www.youtube.com/404"), false);
```

- [ ] **Step 2: Test same-tab replacement behavior**

Run `src/content.js` in a Node `vm` context with a known channel URL, inert DOM methods, and a `location.replace` spy. Assert that `window.stop()` runs once and the replacement destination is exactly `https://www.youtube.com/404`.

- [ ] **Step 3: Run the tests**

Run `npm test` and expect all tests to pass because the existing URL classifier already treats `/404` as an ordinary YouTube page.

### Task 2: Use YouTube's Real 404 Page

**Files:**
- Modify: `src/content.js`
- Modify: `src/manifest.json`
- Delete: `src/blocked.html`
- Delete: `src/blocked.css`

- [ ] **Step 1: Change the blocking navigation**

Define and use the fixed destination:

```js
const BLOCKED_DESTINATION = "https://www.youtube.com/404";

function blockPage() {
  if (blocked) {
    return;
  }

  blocked = true;
  clearObserver();
  window.stop();
  stopMedia();
  location.replace(BLOCKED_DESTINATION);
}
```

- [ ] **Step 2: Remove the local page declaration and files**

Delete `web_accessible_resources` from the manifest and remove both local error-page files. The manifest must end after the `content_scripts` array:

```json
  "content_scripts": [
    {
      "matches": [
        "*://youtube.com/*",
        "*://*.youtube.com/*",
        "*://youtu.be/*"
      ],
      "js": ["filter.js", "content.js"],
      "run_at": "document_start",
      "all_frames": false
    }
  ]
```

- [ ] **Step 3: Advance the release version**

Set `version` to `1.1.0` in `src/manifest.json` and `package.json`, then run:

```bash
npm install --package-lock-only --ignore-scripts
```

### Task 3: Package and Document the Change

**Files:**
- Modify: `scripts/build.sh`
- Modify: `README.md`

- [ ] **Step 1: Reduce the archive inputs**

Change both file lists in `scripts/build.sh` to contain only:

```sh
manifest.json filter.js content.js
```

- [ ] **Step 2: Update user documentation**

Describe the real YouTube 404 redirect, same-tab behavior, and the `route-sentinel-chromium-v1.1.0.zip` archive name. State that YouTube owns the resulting mascot, branding, localization, and search form.

- [ ] **Step 3: Verify the release candidate**

Run `npm test`, `npm run build`, inspect the archive with `unzip -l`, validate the manifest JSON, and confirm the working tree contains no unintended changes.

Expected: eight tests pass; the archive lists only `manifest.json`, `filter.js`, and `content.js`; `npm audit --omit=dev` reports zero vulnerabilities.

- [ ] **Step 4: Publish**

Commit and push the source, tag `v1.1.0`, wait for the GitHub workflow, and confirm the public release ZIP matches the local SHA-256 digest.
