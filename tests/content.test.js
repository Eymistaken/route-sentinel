// SPDX-License-Identifier: GPL-3.0-only

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const filter = require("../src/filter.js");

const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");

function runContentScript({ documentStub, href, embedded = false, sentinel = filter }) {
  const navigation = [];
  const location = {
    href,
    replace(destination) {
      navigation.push(destination);
    },
  };
  const window = {
    addEventListener() {},
    stop() {},
  };

  window.self = window;
  window.top = embedded ? {} : window;

  vm.runInNewContext(source, {
    RouteSentinelFilter: sentinel,
    document: documentStub,
    Element: class Element {},
    location,
    MutationObserver: class MutationObserver {
      disconnect() {}
      observe() {}
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    window,
  });

  return navigation;
}

test("replaces a blocked destination with YouTube's 404 page in the current tab", () => {
  const navigation = [];
  let stopCalls = 0;

  const document = {
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    scripts: [],
  };
  const location = {
    href: "https://www.youtube.com/@m6nifestgirls",
    replace(destination) {
      navigation.push(destination);
    },
  };
  const window = {
    addEventListener() {},
    stop() {
      stopCalls += 1;
    },
  };

  vm.runInNewContext(source, {
    RouteSentinelFilter: {
      isKnownChannelUrl() {
        return true;
      },
    },
    document,
    Element: class Element {},
    location,
    setTimeout,
    clearTimeout,
    window,
  });

  assert.equal(stopCalls, 1);
  assert.deepEqual(navigation, ["https://www.youtube.com/404"]);
});

test("blocks a matching current tab title when YouTube metadata is stale", () => {
  const documentStub = {
    addEventListener() {},
    querySelector(selector) {
      if (selector === 'meta[name="title"]') {
        return {
          getAttribute() {
            return "Unrelated previous video";
          },
        };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    scripts: [],
    title: "(172) Manifest - Toz Pembe | Lyrics-Sözleri - YouTube",
  };

  assert.deepEqual(
    runContentScript({
      documentStub,
      href: "https://www.youtube.com/watch?v=IKgJr8hyv14",
    }),
    ["https://www.youtube.com/404"],
  );
});

test("blocks an embedded player from its title bar and empties the frame", () => {
  const documentStub = {
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".ytp-title-link") {
        return { textContent: "manifest - Toz Pembe | Official Music Video" };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    scripts: [],
    // An embedded player keeps this generic until its own chrome renders.
    title: "YouTube",
  };

  assert.deepEqual(
    runContentScript({
      documentStub,
      href: "https://www.youtube.com/embed/IKgJr8hyv14?autoplay=1&origin=https%3A%2F%2Fwww.google.com",
      embedded: true,
    }),
    ["about:blank"],
  );
});

test("blocks a lyric reupload embedded by an unrelated channel", () => {
  const documentStub = {
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".ytp-title-link") {
        return { textContent: "Toz Pembe (Sözleri / Lyrics)" };
      }
      if (selector === ".ytp-title-channel-name") {
        return { textContent: "Lyrics Dünyası" };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    scripts: [],
    title: "YouTube",
  };

  assert.deepEqual(
    runContentScript({
      documentStub,
      href: "https://www.youtube-nocookie.com/embed/abc123",
      embedded: true,
    }),
    ["about:blank"],
  );
});

test("leaves an unrelated embedded player alone", () => {
  const documentStub = {
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".ytp-title-link") {
        return { textContent: "Linux kernel release notes" };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    scripts: [],
    title: "YouTube",
  };

  assert.deepEqual(
    runContentScript({
      documentStub,
      href: "https://www.youtube.com/embed/abc123",
      embedded: true,
    }),
    [],
  );
});
