// SPDX-License-Identifier: GPL-3.0-only

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const filter = require("../src/filter.js");

test("recognizes only YouTube hosts", () => {
  assert.equal(filter.isYouTubeUrl("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(filter.isYouTubeUrl("https://music.youtube.com/watch?v=abc"), true);
  assert.equal(filter.isYouTubeUrl("https://youtu.be/abc"), true);
  assert.equal(filter.isYouTubeUrl("https://youtube.com.example.test/watch?v=abc"), false);
  assert.equal(filter.isYouTubeUrl("not a URL"), false);
});

test("recognizes supported video destination forms", () => {
  const videoUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://www.youtube.com/shorts/abc",
    "https://www.youtube.com/live/abc",
    "https://www.youtube.com/embed/abc",
    "https://youtu.be/abc",
  ];

  for (const url of videoUrls) {
    assert.equal(filter.isVideoUrl(url), true, url);
  }

  assert.equal(filter.isVideoUrl("https://www.youtube.com/"), false);
  assert.equal(filter.isVideoUrl("https://www.youtube.com/results?search_query=crush"), false);
  assert.equal(filter.isVideoUrl("https://youtu.be/"), false);
});

test("matches blocked title keywords without case sensitivity", () => {
  assert.equal(filter.matchesBlockedKeyword("MANIFEST live performance"), true);
  assert.equal(filter.matchesBlockedKeyword("A CrUsH lyric video"), true);
  assert.equal(filter.matchesBlockedKeyword("Manifestival documentary"), true);
  assert.equal(filter.matchesBlockedKeyword("Crushing guitar tones"), true);
  assert.equal(filter.matchesBlockedKeyword("Unrelated music video"), false);
  assert.equal(filter.matchesBlockedKeyword(null), false);
});

test("matches official channel URLs", () => {
  const blockedUrls = [
    "https://www.youtube.com/@m6nifestgirls",
    "https://www.youtube.com/@M6NIFESTGIRLS/videos",
    "https://www.youtube.com/channel/UC3aqBnkDAfMh5eUmiYi_tfQ/shorts",
    "https://www.youtube.com/@wearecrushboys/live",
    "https://www.youtube.com/channel/UCdKIMZMJeZtLwitpv0O_U3Q",
  ];

  for (const url of blockedUrls) {
    assert.equal(filter.isKnownChannelUrl(url), true, url);
  }

  assert.equal(filter.isKnownChannelUrl("https://www.youtube.com/@manifestation"), false);
  assert.equal(filter.isKnownChannelUrl("https://example.com/@wearecrushboys"), false);
});

test("matches metadata by title, channel ID, handle, or exact owner name", () => {
  assert.equal(filter.shouldBlockMetadata({ title: "Manifest fan lyrics" }), true);
  assert.equal(
    filter.shouldBlockMetadata({ channelId: "UC3aqBnkDAfMh5eUmiYi_tfQ", title: "Hileli" }),
    true,
  );
  assert.equal(
    filter.shouldBlockMetadata({ ownerUrl: "https://youtube.com/@wearecrushboys", title: "Benim Olsana" }),
    true,
  );
  assert.equal(filter.shouldBlockMetadata({ ownerName: "CRUSH", title: "Benim Olsana" }), true);
  assert.equal(filter.shouldBlockMetadata({ ownerName: "Crush Drums", title: "Drum lesson" }), false);
  assert.equal(filter.shouldBlockMetadata({ title: "Unrelated music", channelId: "UCother" }), false);
});

test("extracts representative videoDetails JSON", () => {
  const script = String.raw`
    window.ytInitialPlayerResponse = {
      "responseContext": {},
      "videoDetails": {
        "videoId": "ZVVylrAkmfg",
        "title": "CRUSH - BENİM OLSANA | Official Music Video",
        "channelId": "UCdKIMZMJeZtLwitpv0O_U3Q",
        "author": "CRUSH",
        "shortDescription": "A brace } and an escaped quote \" stay inside strings."
      }
    };
  `;

  assert.deepEqual(filter.extractPlayerMetadata(script), {
    title: "CRUSH - BENİM OLSANA | Official Music Video",
    channelId: "UCdKIMZMJeZtLwitpv0O_U3Q",
    ownerName: "CRUSH",
    ownerUrl: "",
  });
});

test("handles malformed and oversized serialized data safely", () => {
  assert.equal(filter.extractPlayerMetadata("not player data"), null);
  assert.equal(filter.extractPlayerMetadata('"videoDetails":{"title":"unfinished"'), null);
  assert.equal(filter.extractPlayerMetadata(`"videoDetails":{}${"x".repeat(2 * 1024 * 1024)}`), null);
  assert.equal(filter.extractPlayerMetadata(null), null);
});
