// SPDX-License-Identifier: GPL-3.0-only

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const filter = require("../src/filter.js");

test("replaces a blocked destination with YouTube's 404 page in the current tab", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
  const navigation = [];

  const document = {
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
  const location = {
    href: "https://www.youtube.com/watch?v=IKgJr8hyv14",
    replace(destination) {
      navigation.push(destination);
    },
  };

  vm.runInNewContext(source, {
    RouteSentinelFilter: filter,
    document,
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
    window: {
      addEventListener() {},
      stop() {},
    },
  });

  assert.deepEqual(navigation, ["https://www.youtube.com/404"]);
});
