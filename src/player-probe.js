// SPDX-License-Identifier: GPL-3.0-only

// Runs in the page's own JavaScript context so it can ask YouTube's player
// which video it is about to play, instead of guessing at markup that YouTube
// is free to restyle. It only reports what the player says; every decision and
// every block still happens in the isolated content script.
(function probeRouteSentinelPlayer() {
  "use strict";

  const REPORT_EVENT = "routesentinel:videodata";
  const POLL_INTERVAL_MS = 120;
  const PROBE_WINDOW_MS = 15_000;
  const PLAYER_SELECTOR = "#movie_player, .html5-video-player";

  let deadline = Date.now() + PROBE_WINDOW_MS;
  let lastReport = "";
  let timer = null;

  function readVideoData() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player || typeof player.getVideoData !== "function") {
      return null;
    }

    try {
      const data = player.getVideoData();
      if (data === null || typeof data !== "object") {
        return null;
      }

      return {
        title: typeof data.title === "string" ? data.title : "",
        ownerName: typeof data.author === "string" ? data.author : "",
      };
    } catch {
      // The player is still initializing, or it is not a YouTube player.
      return null;
    }
  }

  function report(data) {
    let payload;
    try {
      payload = JSON.stringify(data);
    } catch {
      return;
    }

    if (payload === lastReport) {
      return;
    }

    lastReport = payload;
    document.dispatchEvent(new CustomEvent(REPORT_EVENT, { detail: payload }));
  }

  function tick() {
    timer = null;

    const data = readVideoData();
    if (data !== null && data.title.length > 0) {
      report(data);
    }

    if (Date.now() < deadline) {
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
  }

  function restart() {
    deadline = Date.now() + PROBE_WINDOW_MS;
    lastReport = "";
    if (timer === null) {
      tick();
    }
  }

  document.addEventListener("yt-navigate-finish", restart, true);
  window.addEventListener("popstate", restart, true);

  tick();
})();
