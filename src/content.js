// SPDX-License-Identifier: GPL-3.0-only

(function startRouteSentinel() {
  "use strict";

  const filter = globalThis.RouteSentinelFilter;
  if (!filter) {
    return;
  }

  const OBSERVATION_TIMEOUT_MS = 12_000;
  const VIDEO_CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model",
  ].join(",");

  let blocked = false;
  let observedUrl = "";
  let observer = null;
  let observationTimeout = null;
  let scheduledCheck = null;
  const inspectedScripts = new WeakSet();

  function firstAttribute(selectors, attributeName) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element?.getAttribute(attributeName);
      if (value) {
        return value;
      }
    }
    return "";
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function findCardOwnerUrl(root) {
    const links = root.querySelectorAll(
      'a[itemprop="url"][href], a[href*="/channel/"], a[href*="/@"]',
    );

    for (const link of links) {
      const value = link.getAttribute("href") || "";
      if (value.includes("/channel/") || value.includes("/@")) {
        try {
          return new URL(value, location.href).href;
        } catch {
          // Ignore malformed page-owned URLs.
        }
      }
    }

    return "";
  }

  function findDocumentOwnerUrl() {
    const value = firstAttribute(
      [
        'span[itemprop="author"] link[itemprop="url"]',
        "ytd-watch-metadata #owner ytd-channel-name a[href]",
        "ytd-video-owner-renderer ytd-channel-name a[href]",
      ],
      "href",
    );

    if (!value) {
      return "";
    }

    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  }

  function readDocumentMetadata() {
    const title =
      firstAttribute(
        [
          'meta[name="title"]',
          'meta[property="og:title"]',
          'head > meta[itemprop="name"]',
        ],
        "content",
      ) || document.title.replace(/\s+-\s+YouTube\s*$/i, "");

    return {
      title,
      channelId: firstAttribute(
        ['meta[itemprop="channelId"]', 'meta[name="channelId"]'],
        "content",
      ),
      ownerName:
        firstAttribute(
          [
            'span[itemprop="author"] link[itemprop="name"]',
            'meta[itemprop="author"]',
          ],
          "content",
        ) ||
        firstText([
          "ytd-watch-metadata #channel-name",
          "ytd-video-owner-renderer ytd-channel-name",
        ]),
      ownerUrl: findDocumentOwnerUrl(),
    };
  }

  function readSerializedMetadata() {
    for (const script of document.scripts) {
      if (inspectedScripts.has(script)) {
        continue;
      }

      const scriptText = script.textContent || "";
      if (scriptText.length === 0) {
        continue;
      }

      inspectedScripts.add(script);
      const metadata = filter.extractPlayerMetadata(scriptText);
      if (metadata) {
        return metadata;
      }
    }

    return null;
  }

  function clearObserver() {
    observer?.disconnect();
    observer = null;

    if (observationTimeout !== null) {
      clearTimeout(observationTimeout);
      observationTimeout = null;
    }
  }

  function stopMedia() {
    for (const media of document.querySelectorAll("audio, video")) {
      try {
        media.pause();
        media.removeAttribute("src");
        for (const source of media.querySelectorAll("source")) {
          source.removeAttribute("src");
        }
        media.load();
      } catch {
        // Continue stopping any other media elements.
      }
    }
  }

  function blockPage() {
    if (blocked) {
      return;
    }

    blocked = true;
    clearObserver();
    window.stop();
    stopMedia();
    location.replace(chrome.runtime.getURL("blocked.html"));
  }

  function evaluateCurrentPage() {
    if (blocked) {
      return "blocked";
    }

    if (filter.isKnownChannelUrl(location.href)) {
      blockPage();
      return "blocked";
    }

    if (!filter.isVideoUrl(location.href)) {
      return "allowed";
    }

    if (filter.shouldBlockMetadata(readDocumentMetadata())) {
      blockPage();
      return "blocked";
    }

    const serializedMetadata = readSerializedMetadata();
    if (filter.shouldBlockMetadata(serializedMetadata)) {
      blockPage();
      return "blocked";
    }

    return serializedMetadata ? "allowed" : "pending";
  }

  function beginCheck() {
    clearObserver();
    observedUrl = location.href;
    blocked = false;

    if (evaluateCurrentPage() !== "pending") {
      return;
    }

    observer = new MutationObserver(() => {
      if (location.href !== observedUrl) {
        beginCheck();
        return;
      }
      if (evaluateCurrentPage() !== "pending") {
        clearObserver();
      }
    });
    observer.observe(document, {
      attributes: true,
      attributeFilter: ["content", "href"],
      childList: true,
      subtree: true,
    });

    observationTimeout = setTimeout(clearObserver, OBSERVATION_TIMEOUT_MS);
  }

  function scheduleCheck() {
    if (scheduledCheck !== null) {
      clearTimeout(scheduledCheck);
    }
    scheduledCheck = setTimeout(() => {
      scheduledCheck = null;
      beginCheck();
    }, 0);
  }

  function metadataFromLink(anchor) {
    const card = anchor.closest(VIDEO_CARD_SELECTOR);
    const title =
      anchor.getAttribute("title") ||
      card?.querySelector("#video-title, #video-title-link, yt-formatted-string")?.textContent?.trim() ||
      anchor.textContent?.trim() ||
      "";

    return {
      title,
      channelId: "",
      ownerName:
        card?.querySelector("#channel-name, ytd-channel-name")?.textContent?.trim() || "",
      ownerUrl: card ? findCardOwnerUrl(card) : "",
    };
  }

  function handleCapturedClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest("a[href]");
    if (!anchor) {
      return;
    }

    let destination;
    try {
      destination = new URL(anchor.href, location.href).href;
    } catch {
      return;
    }

    const shouldBlock =
      filter.isKnownChannelUrl(destination) ||
      (filter.isVideoUrl(destination) && filter.shouldBlockMetadata(metadataFromLink(anchor)));

    if (shouldBlock) {
      event.preventDefault();
      event.stopImmediatePropagation();
      blockPage();
    }
  }

  document.addEventListener("click", handleCapturedClick, true);
  document.addEventListener("yt-navigate-start", scheduleCheck, true);
  document.addEventListener("yt-navigate-finish", scheduleCheck, true);
  window.addEventListener("popstate", scheduleCheck, true);

  beginCheck();
})();
