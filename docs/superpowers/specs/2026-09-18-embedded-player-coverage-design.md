# Embedded Player Coverage Design

## Purpose

Extend Route Sentinel's existing rules to matching videos that are played without visiting YouTube, and to lyric videos and reuploads that leave the performer name out of the title.

## Problem

A Google Search result page can play a YouTube video inside the result card. Google does this by loading `https://www.youtube.com/embed/<id>` in a frame on `google.com`. The frame is a YouTube document, but the content script declared `"all_frames": false`, so it only ever ran in the top-level tab. Nothing evaluated the embedded destination and the video played normally.

A second gap is independent of the frame: a lyric video or reupload on an unrelated channel is often titled with the song name alone, which matches neither the `manifest` and `crush` keywords nor the two official channels.

## Behavior

The content script runs in every frame on `youtube.com`, `youtu.be`, and `youtube-nocookie.com`. An embedded destination is evaluated with the same rules as a watch page.

A match in the top-level tab keeps the existing behavior and replaces the location with `https://www.youtube.com/404`. A match inside a frame cannot use that destination, because YouTube sends `X-Frame-Options: SAMEORIGIN` and a third-party frame would render a browser error instead of the 404 page. A matching frame is therefore emptied in place with `about:blank` after the document is stopped and media elements are cleared. The hosting page is never read or modified, and the extension requests no access outside YouTube domains.

Song titles are matched as whole phrases against the title, separately from the substring keywords. Phrase matching prevents a short Turkish word such as `hileli` from matching inside a longer inflected word. Text is normalized with NFKD and combining marks are removed before comparison, because `"İ".toLowerCase()` yields `i` followed by a combining dot above and would otherwise never match a plain `i`.

## Metadata Discovery

An embedded player publishes its metadata differently from a watch page:

- the document title stays `YouTube` until the player chrome renders, so that placeholder is treated as no title at all;
- the player's own title bar (`.ytp-title-link`, `.ytp-title-text a`, `.ytp-title-expanded-title`) and channel elements are read as additional sources;
- serialized player data arrives as a JSON string nested inside another JSON document under keys such as `embedded_player_response`, so those string values are unwrapped and searched, to a bounded depth and count;
- the embedded payload reuses the `videoDetails` key for overlay renderers that carry no title, channel ID, or author, so such objects are skipped rather than returned.

A destination counts as resolved only when serialized data yields a non-empty title. Previously any parsed object ended observation, which would have stopped the mutation observer before an embedded player rendered its title.

## Player-Reported Metadata

Reading a framed player's markup means depending on class names YouTube can change, and a player that is still initializing publishes nothing at all. A separate content script therefore runs in the page's own JavaScript context, where the YouTube player element exposes `getVideoData()`, and polls for it while a decision is outstanding.

That script has one job: report. It serializes the title and author to JSON and dispatches them on a DOM event. It never blocks, never navigates, and never reads anything else from the page. The isolated content script receives the event, rejects a payload that is not a string or is over 8 KiB, parses it as JSON, and runs the existing rules. A report is honored inside a frame, where the frame exists only to play its own video, and in a top-level tab only when the address is a video destination, so that a hover preview inside a feed cannot blank the feed.

If the browser does not support a page-context content script, the declaration is ignored and the markup and serialized-data paths continue to apply.

The framed player path forms `/e/` and `/v/` are recognized alongside `/embed/`.

## Acceptance Criteria

- A matching video played inside Google Search's inline player stops and leaves the player area blank.
- A non-matching embedded video plays normally.
- A matching video is blocked from the player's own report even when nothing identifying is in the markup.
- A player report in a top-level feed does not block the feed.
- Top-level blocking still navigates to `https://www.youtube.com/404`.
- A lyric video titled with a known song title alone is blocked on any channel.
- `Hileli` matches and `Hilelileri` does not.
- `HİLELİ` and `Sözleri` match their unaccented forms.
- No host permission outside YouTube domains is added.
- Automated tests pass and the release ZIP has `manifest.json` at its archive root.
