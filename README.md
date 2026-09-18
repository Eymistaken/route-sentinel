# Route Sentinel

Route Sentinel is a small, interface-free Chromium extension for Linux. It stops selected YouTube destinations and replaces them with YouTube's real 404 page in the same tab.

The current rules block:

- any YouTube video, Short, live stream, premiere, or embed with `manifest` or `crush` anywhere in its title, without case sensitivity;
- any video whose title contains a known Manifest or CRUSH song title as a whole phrase (`Toz Pembe`, `Hileli`, `Benim Olsana`), on any channel, so lyric videos, reuploads, and edits that leave the performer name out of the title are covered too;
- every page and video from Manifest's official channel, [`@m6nifestgirls`](https://www.youtube.com/@m6nifestgirls) (`UC3aqBnkDAfMh5eUmiYi_tfQ`);
- every page and video from CRUSH's official channel, [`@wearecrushboys`](https://www.youtube.com/@wearecrushboys) (`UCdKIMZMJeZtLwitpv0O_U3Q`);
- matching destinations opened through ordinary links, search results, recommendations, playlists, Shorts, or YouTube's in-page navigation;
- matching videos played through YouTube's embedded player on another site, including the inline player Google Search opens inside its own result page.

There is no toolbar button, settings screen, account, analytics, telemetry, remote configuration, or native background service. Chromium starts the extension automatically whenever the browser starts.

## Install

Route Sentinel currently supports desktop Chromium on Linux. Firefox is not included in this release because standard Firefox builds require Mozilla-signed extension packages.

1. Download `route-sentinel-chromium-v1.2.1.zip` from the latest GitHub Release or build it locally.
2. Extract the ZIP into a permanent folder. Do not select the ZIP itself and do not delete the extracted folder after installation.
3. Open `chrome://extensions` in Chromium.
4. Enable **Developer mode**.
5. Select **Load unpacked**.
6. Select the extracted folder that contains `manifest.json`.

Chromium remembers unpacked extensions across browser restarts. Some Chromium builds show a developer-mode notice at startup; this is expected for an extension installed outside the Chrome Web Store.

## Update

1. Download and extract the new release over the existing extension folder.
2. Open `chrome://extensions`.
3. Find **Route Sentinel** and select its reload button.

## Remove completely

1. Open `chrome://extensions`.
2. Find **Route Sentinel** and select **Remove**.
3. Confirm the removal.
4. Delete the extracted Route Sentinel folder and any downloaded ZIP files.

The extension creates no native service, startup entry, user account, or separate configuration file. No additional cleanup is required.

## How it works

The content script starts at Chromium's earliest `document_start` phase on `youtube.com`, `youtu.be`, and `youtube-nocookie.com`, in every frame. Known channel URLs are checked directly. On video destinations, the extension reads the title and owner information from the page metadata, YouTube's serialized player data, and the embedded player's own title bar. When a rule matches, it stops the document and clears media elements.

A match in the top-level tab replaces the current location with [`https://www.youtube.com/404`](https://www.youtube.com/404). The navigation stays in the same tab, and YouTube provides the mascot, branding, and search form.

### Embedded players

Search engines and other sites play YouTube videos without leaving their own page by loading a YouTube player (`/embed/`, `/e/`, or `/v/`) in a frame. Because that frame is a YouTube document, Route Sentinel runs inside it and applies the same rules. YouTube refuses to render its own pages inside a third-party frame, so a matching embedded player is emptied in place instead of being sent to the 404 page: the video stops and the player area goes blank while the surrounding page is left untouched.

The extension does not request access to Google Search or any other non-YouTube site, and it does not read or modify the page that hosts the player.

A framed player publishes very little in its markup, and the markup it does publish is YouTube's to restyle at any time. So a second, separate script runs in the page's own JavaScript context and asks YouTube's player which video it holds, through the player's own `getVideoData()` method. That script only reports what the player says, as a JSON string on a DOM event; it makes no decision and performs no blocking. The isolated content script parses that report under a size limit and applies the same rules as everywhere else. A report is acted on inside a frame, or in a top-level tab only when the address is a video destination, so a hover preview in a feed cannot blank the feed.

### Loading boundary

YouTube does not put a title or channel ID in a normal `/watch?v=...` or `/embed/...` URL. The browser must therefore receive enough of the initial HTML response to expose that metadata. Route Sentinel is designed to stop a matching page before normal interaction and media playback, but it cannot guarantee that zero bytes of the initial HTML were downloaded, and an embedded player that only publishes its title once its own chrome renders may briefly exist before the rule matches. The extension does not intercept HTTPS, install a root certificate, or proxy browser traffic.

The extension observes document changes only while a relevant video destination is unresolved, for at most 12 seconds. It does not continuously scan the YouTube home or search feeds. This keeps CPU and memory use low.

YouTube may change its page structure in the future. If a matching page stops being detected, open an issue with the destination type and a non-sensitive example URL.

### Title matching

Keyword rules match anywhere in a title, so `Manifestival` and `Crushing` match as well. Song-title rules match only as whole phrases, so `Hileli` matches but `Hilelileri` does not. Titles are compared after Unicode normalization strips combining marks, which keeps Turkish spellings such as `HİLELİ` and `Sözleri` matching their plain forms. Add or remove entries in `BLOCKED_KEYWORDS` and `BLOCKED_SONG_TITLES` in `src/filter.js` to change the rules.

## Privacy and security

- All decisions happen locally in the browser.
- No browsing data leaves the device.
- No API key or external server is used.
- Access is limited to YouTube domains.
- Page-owned text is never evaluated as JavaScript.
- Serialized metadata is size-limited, nesting-limited, and parsed as JSON.
- The project has no third-party runtime dependencies.

## Development

Requirements:

- Node.js 20 or newer
- Info-ZIP's `zip` command

Run the tests:

```bash
npm test
```

Build the release package:

```bash
npm run build
```

The build is written to `dist/route-sentinel-chromium-v1.2.1.zip`. Its archive root contains `manifest.json`, so the extracted directory can be selected directly with **Load unpacked**.

## License

Route Sentinel is free software licensed under the [GNU General Public License version 3](LICENSE), using the `GPL-3.0-only` SPDX identifier.
