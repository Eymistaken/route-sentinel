// SPDX-License-Identifier: GPL-3.0-only

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
