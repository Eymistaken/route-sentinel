// SPDX-License-Identifier: GPL-3.0-only

(function exposeFilter(root, createFilter) {
  "use strict";

  const filter = Object.freeze(createFilter());

  if (typeof module === "object" && module.exports) {
    module.exports = filter;
    return;
  }

  Object.defineProperty(root, "RouteSentinelFilter", {
    configurable: false,
    enumerable: false,
    value: filter,
    writable: false,
  });
})(typeof globalThis === "object" ? globalThis : this, function createFilter() {
  "use strict";

  const MAX_SERIALIZED_DATA_LENGTH = 2 * 1024 * 1024;
  const BLOCKED_KEYWORDS = Object.freeze(["manifest", "crush"]);
  const BLOCKED_CHANNEL_IDS = new Set([
    "UC3aqBnkDAfMh5eUmiYi_tfQ",
    "UCdKIMZMJeZtLwitpv0O_U3Q",
  ]);
  const BLOCKED_CHANNEL_HANDLES = new Set([
    "@m6nifestgirls",
    "@wearecrushboys",
  ]);

  function parseUrl(input) {
    if (typeof input !== "string" || input.length === 0) {
      return null;
    }

    try {
      return new URL(input);
    } catch {
      return null;
    }
  }

  function isYouTubeHost(hostname) {
    const normalizedHost = hostname.toLowerCase();
    return (
      normalizedHost === "youtu.be" ||
      normalizedHost === "youtube.com" ||
      normalizedHost.endsWith(".youtube.com")
    );
  }

  function isYouTubeUrl(input) {
    const url = parseUrl(input);
    return url !== null && isYouTubeHost(url.hostname);
  }

  function decodedPathSegments(url) {
    return url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
  }

  function isVideoUrl(input) {
    const url = parseUrl(input);
    if (url === null || !isYouTubeHost(url.hostname)) {
      return false;
    }

    const segments = decodedPathSegments(url);
    if (url.hostname.toLowerCase() === "youtu.be") {
      return segments.length > 0;
    }

    if (url.pathname === "/watch") {
      return url.searchParams.has("v");
    }

    return (
      segments.length > 1 &&
      (segments[0] === "shorts" || segments[0] === "live" || segments[0] === "embed")
    );
  }

  function isKnownChannelUrl(input) {
    const url = parseUrl(input);
    if (url === null || !isYouTubeHost(url.hostname) || url.hostname.toLowerCase() === "youtu.be") {
      return false;
    }

    const segments = decodedPathSegments(url);
    if (segments.length === 0) {
      return false;
    }

    if (segments[0].startsWith("@")) {
      return BLOCKED_CHANNEL_HANDLES.has(segments[0].toLowerCase());
    }

    return segments[0] === "channel" && BLOCKED_CHANNEL_IDS.has(segments[1] || "");
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  function matchesBlockedKeyword(value) {
    const normalizedValue = normalizeText(value);
    return (
      normalizedValue.length > 0 &&
      BLOCKED_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))
    );
  }

  function shouldBlockMetadata(metadata) {
    if (metadata === null || typeof metadata !== "object") {
      return false;
    }

    if (matchesBlockedKeyword(metadata.title)) {
      return true;
    }

    if (typeof metadata.channelId === "string" && BLOCKED_CHANNEL_IDS.has(metadata.channelId)) {
      return true;
    }

    if (typeof metadata.ownerUrl === "string" && isKnownChannelUrl(metadata.ownerUrl)) {
      return true;
    }

    const normalizedOwnerName = normalizeText(metadata.ownerName);
    return normalizedOwnerName === "manifest" || normalizedOwnerName === "crush";
  }

  function findObjectEnd(text, startIndex) {
    let depth = 0;
    let escaped = false;
    let insideString = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const character = text[index];

      if (insideString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          insideString = false;
        }
        continue;
      }

      if (character === '"') {
        insideString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }
    }

    return -1;
  }

  function extractPlayerMetadata(scriptText) {
    if (
      typeof scriptText !== "string" ||
      scriptText.length === 0 ||
      scriptText.length > MAX_SERIALIZED_DATA_LENGTH
    ) {
      return null;
    }

    const marker = '"videoDetails"';
    let markerIndex = scriptText.indexOf(marker);

    while (markerIndex !== -1) {
      const colonIndex = scriptText.indexOf(":", markerIndex + marker.length);
      if (colonIndex === -1) {
        return null;
      }

      let objectStart = colonIndex + 1;
      while (/\s/.test(scriptText[objectStart] || "")) {
        objectStart += 1;
      }

      if (scriptText[objectStart] === "{") {
        const objectEnd = findObjectEnd(scriptText, objectStart);
        if (objectEnd !== -1) {
          try {
            const details = JSON.parse(scriptText.slice(objectStart, objectEnd));
            return {
              title: typeof details.title === "string" ? details.title : "",
              channelId: typeof details.channelId === "string" ? details.channelId : "",
              ownerName: typeof details.author === "string" ? details.author : "",
              ownerUrl: "",
            };
          } catch {
            // Keep looking in case another marker contains valid player data.
          }
        }
      }

      markerIndex = scriptText.indexOf(marker, markerIndex + marker.length);
    }

    return null;
  }

  return {
    extractPlayerMetadata,
    isKnownChannelUrl,
    isVideoUrl,
    isYouTubeUrl,
    matchesBlockedKeyword,
    parseUrl,
    shouldBlockMetadata,
  };
});
