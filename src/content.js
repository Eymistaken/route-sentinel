// SPDX-License-Identifier: GPL-3.0-only

(function startRouteSentinel() {
  "use strict";

  const filter = globalThis.RouteSentinelFilter;
  if (!filter) {
    return;
  }

  const OBSERVATION_TIMEOUT_MS = 12_000;
  const BLOCKED_DESTINATION = "https://www.youtube.com/404";
  // YouTube refuses to render its own pages inside a third-party frame, so an
  // embedded player is emptied in place instead of being sent to the 404 page.
  const BLOCKED_FRAME_DESTINATION = "about:blank";
  // An embedded player keeps the document title generic until its own chrome
  // renders, so a bare "YouTube" must not be mistaken for a resolved title.
  const PLACEHOLDER_TITLES = new Set(["", "youtube"]);
  const EMBED_TITLE_SELECTORS = [
    ".ytp-title-link",
    ".ytp-title-text a",
    ".ytp-title-expanded-title",
  ];
  const EMBED_OWNER_NAME_SELECTORS = [
    ".ytp-title-channel-name",
    ".ytp-title-expanded-subtitle",
    ".ytp-title-subtext a",
  ];
  const EMBED_OWNER_URL_SELECTORS = [
    ".ytp-title-channel a[href]",
    "a.ytp-title-channel-logo[href]",
    ".ytp-title-subtext a[href]",
  ];
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

  function isEmbeddedFrame() {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  }

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
        ...EMBED_OWNER_URL_SELECTORS,
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

  function meaningfulTitle(value) {
    const cleaned = (value || "").replace(/\s+-\s+YouTube\s*$/i, "").trim();
    return PLACEHOLDER_TITLES.has(cleaned.toLowerCase()) ? "" : cleaned;
  }

  function readDocumentMetadata() {
    const title =
      meaningfulTitle(document.title) ||
      meaningfulTitle(
        firstAttribute(
          [
            'meta[name="title"]',
            'meta[property="og:title"]',
            'head > meta[itemprop="name"]',
          ],
          "content",
        ),
      ) ||
      meaningfulTitle(firstText(EMBED_TITLE_SELECTORS));

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
          ...EMBED_OWNER_NAME_SELECTORS,
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
    location.replace(isEmbeddedFrame() ? BLOCKED_FRAME_DESTINATION : BLOCKED_DESTINATION);
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

    // An embedded player ships player data without a title, so keep observing
    // until a title is known rather than treating the destination as allowed.
    return filter.hasResolvedTitle(serializedMetadata) ? "allowed" : "pending";
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
