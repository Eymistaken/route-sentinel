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
  const MAX_SERIALIZED_NESTING = 2;
  const MAX_SERIALIZED_RESPONSES = 4;
  const BLOCKED_KEYWORDS = Object.freeze(["manifest", "crush"]);
  // Lyric videos, reuploads, and edits from unrelated channels usually drop the
  // performer name from the title, so known song titles are matched as whole
  // phrases as well.
  const BLOCKED_SONG_TITLES = Object.freeze([
    "toz pembe",
    "hileli",
    "benim olsana",
  ]);
  const BLOCKED_CHANNEL_IDS = new Set([
    "UC3aqBnkDAfMh5eUmiYi_tfQ",
    "UCdKIMZMJeZtLwitpv0O_U3Q",
  ]);
  const BLOCKED_CHANNEL_HANDLES = new Set([
    "@m6nifestgirls",
    "@wearecrushboys",
  ]);
  // Embedded players ship their player data as a JSON string inside another
  // JSON document, so these keys are unwrapped before the data is searched.
  const SERIALIZED_RESPONSE_KEYS = Object.freeze([
    '"embedded_player_response"',
    '"player_response"',
    '"serializedPlayerResponse"',
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
      normalizedHost === "youtube-nocookie.com" ||
      normalizedHost.endsWith(".youtube.com") ||
      normalizedHost.endsWith(".youtube-nocookie.com")
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

  function isEmbedUrl(input) {
    const url = parseUrl(input);
    if (url === null || !isYouTubeHost(url.hostname)) {
      return false;
    }

    const segments = decodedPathSegments(url);
    return segments.length > 1 && segments[0] === "embed";
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
    if (typeof value !== "string") {
      return "";
    }

    // Turkish "İ" lowercases to "i" plus a combining dot, which would otherwise
    // never match a plain "i", so combining marks are folded away first.
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .trim()
      .toLowerCase();
  }

  function foldToWords(value) {
    return normalizeText(value)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function matchesBlockedKeyword(value) {
    const normalizedValue = normalizeText(value);
    if (normalizedValue.length === 0) {
      return false;
    }

    if (BLOCKED_KEYWORDS.some((keyword) => normalizedValue.includes(keyword))) {
      return true;
    }

    const paddedWords = ` ${foldToWords(normalizedValue)} `;
    return BLOCKED_SONG_TITLES.some((songTitle) => paddedWords.includes(` ${songTitle} `));
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

  function hasResolvedTitle(metadata) {
    return (
      metadata !== null &&
      typeof metadata === "object" &&
      typeof metadata.title === "string" &&
      metadata.title.trim().length > 0
    );
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

  function findStringEnd(text, startIndex) {
    let escaped = false;

    for (let index = startIndex + 1; index < text.length; index += 1) {
      const character = text[index];

      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        return index + 1;
      }
    }

    return -1;
  }

  function readVideoDetails(text) {
    const marker = '"videoDetails"';
    let markerIndex = text.indexOf(marker);

    while (markerIndex !== -1) {
      const colonIndex = text.indexOf(":", markerIndex + marker.length);
      if (colonIndex === -1) {
        return null;
      }

      let objectStart = colonIndex + 1;
      while (/\s/.test(text[objectStart] || "")) {
        objectStart += 1;
      }

      if (text[objectStart] === "{") {
        const objectEnd = findObjectEnd(text, objectStart);
        if (objectEnd !== -1) {
          try {
            const details = JSON.parse(text.slice(objectStart, objectEnd));
            const metadata = {
              title: typeof details.title === "string" ? details.title : "",
              channelId: typeof details.channelId === "string" ? details.channelId : "",
              ownerName: typeof details.author === "string" ? details.author : "",
              ownerUrl: "",
            };

            // Embedded player payloads reuse the "videoDetails" key for overlay
            // renderers, so keep looking when nothing identifying was found.
            if (metadata.title || metadata.channelId || metadata.ownerName) {
              return metadata;
            }
          } catch {
            // Keep looking in case another marker contains valid player data.
          }
        }
      }

      markerIndex = text.indexOf(marker, markerIndex + marker.length);
    }

    return null;
  }

  function readSerializedResponses(text) {
    const responses = [];

    for (const key of SERIALIZED_RESPONSE_KEYS) {
      let keyIndex = text.indexOf(key);

      while (keyIndex !== -1 && responses.length < MAX_SERIALIZED_RESPONSES) {
        const colonIndex = text.indexOf(":", keyIndex + key.length);
        if (colonIndex === -1) {
          break;
        }

        let valueStart = colonIndex + 1;
        while (/\s/.test(text[valueStart] || "")) {
          valueStart += 1;
        }

        if (text[valueStart] === '"') {
          const valueEnd = findStringEnd(text, valueStart);
          if (valueEnd !== -1) {
            try {
              const value = JSON.parse(text.slice(valueStart, valueEnd));
              if (typeof value === "string" && value.length > 0) {
                responses.push(value);
              }
            } catch {
              // Ignore page-owned values that are not a valid JSON string.
            }
          }
        }

        keyIndex = text.indexOf(key, keyIndex + key.length);
      }
    }

    return responses;
  }

  function extractPlayerMetadata(scriptText, nesting) {
    const depth = typeof nesting === "number" ? nesting : 0;

    if (
      typeof scriptText !== "string" ||
      scriptText.length === 0 ||
      scriptText.length > MAX_SERIALIZED_DATA_LENGTH
    ) {
      return null;
    }

    const metadata = readVideoDetails(scriptText);
    if (metadata !== null) {
      return metadata;
    }

    if (depth >= MAX_SERIALIZED_NESTING) {
      return null;
    }

    for (const nestedText of readSerializedResponses(scriptText)) {
      const nestedMetadata = extractPlayerMetadata(nestedText, depth + 1);
      if (nestedMetadata !== null) {
        return nestedMetadata;
      }
    }

    return null;
  }

  return {
    extractPlayerMetadata,
    hasResolvedTitle,
    isEmbedUrl,
    isKnownChannelUrl,
    isVideoUrl,
    isYouTubeUrl,
    matchesBlockedKeyword,
    parseUrl,
    shouldBlockMetadata,
  };
});
