# Route Sentinel Chromium Extension Design

## Purpose

Route Sentinel is a Chromium Manifest V3 extension that prevents selected YouTube content from becoming usable in the browser. It has no toolbar action, settings page, telemetry, account, remote configuration, or native background process. Chromium starts the extension with the browser.

The extension blocks:

- every YouTube video, Short, live stream, premiere, or embed whose title contains `manifest` or `crush`, using case-insensitive matching;
- every page belonging to Manifest's official channel, `@m6nifestgirls` / `UC3aqBnkDAfMh5eUmiYi_tfQ`;
- every page belonging to CRUSH's official channel, `@wearecrushboys` / `UCdKIMZMJeZtLwitpv0O_U3Q`;
- matching destinations reached through YouTube's single-page navigation, playlists, recommendations, or ordinary browser navigation.

This first release targets desktop Chromium on Linux. Firefox, Debian packages, native services, mobile browsers, and non-browser YouTube clients are outside its scope.

## User Experience

The extension operates without a visible toolbar button. When content matches, it stops the document, pauses and clears any media elements already created, replaces the document with a bundled page, and displays only `404` and `Page not found`. The page does not state which rule matched.

Nonmatching YouTube pages continue normally. Search and recommendation cards are not removed merely because their text matches; the destination is checked when opened. This keeps the extension focused on preventing playback and avoids continuously scanning large feeds.

## Architecture

The extension uses a small content script at `document_start` on YouTube and `youtu.be`. The content script delegates pure matching and metadata extraction to a shared module. It handles three paths:

1. **Known channel URL:** Normalize the URL and immediately block exact Manifest or CRUSH channel handles and channel IDs.
2. **Video URL:** Watch early document metadata and YouTube's serialized player data for a title, channel ID, owner URL, or owner name. Block as soon as a rule matches.
3. **Single-page navigation:** Listen for YouTube navigation events and URL changes, reset the checker, and evaluate the new page data. A short-lived mutation observer is active only while a relevant destination is unresolved and disconnects after a decision or timeout.

The matcher recognizes `/watch`, `/shorts/`, `/live/`, `/embed/`, and `youtu.be` video destinations. It normalizes text with Unicode-aware lowercase conversion. Keyword matching is literal substring matching because the requirement explicitly includes every title containing either word, including compounds such as `Manifestival`.

## Loading Boundary

YouTube does not include the video title or channel ID in an ordinary watch URL. Chromium must therefore receive enough of the initial YouTube document to expose its metadata before a local extension can decide. Route Sentinel runs at the earliest content-script phase and stops a matching document before normal interaction; it is designed to prevent player startup and media playback, but it cannot guarantee that zero bytes of the initial HTML response were downloaded.

This approach intentionally avoids HTTPS interception, root certificates, browser-management policies, and a local proxy.

## Security and Privacy

The trust boundary is limited to untrusted YouTube URLs, DOM nodes, and serialized page data. The implementation:

- never evaluates page strings as code;
- parses JSON only after size and shape checks;
- uses exact host checks rather than substring host checks;
- does not send browsing data anywhere;
- does not request broad access outside YouTube domains;
- keeps the blocked page static and free of inline remote resources;
- uses no third-party runtime dependencies.

The blocked page renders all text as fixed local content. Malformed metadata results in continued observation until the bounded timeout; it never crashes the page checker.

## Project Layout

- `src/manifest.json`: Chromium Manifest V3 permissions and content-script declaration.
- `src/filter.js`: Pure URL, keyword, channel, and metadata matching functions.
- `src/content.js`: Early document guard, metadata discovery, and single-page navigation handling.
- `src/blocked.html` and `src/blocked.css`: Local generic error page.
- `tests/filter.test.js`: Node built-in test coverage for matching and extraction.
- `scripts/build.sh`: Reproducible ZIP builder with no network access.
- `.github/workflows/release.yml`: Test and ZIP artifact workflow.
- `README.md`: Behavior, limitations, installation, verification, removal, and development instructions.
- `LICENSE`: GPL-3.0 license text.

## Testing and Acceptance

Automated tests cover case-insensitive keyword matching, false positives, official handles and channel IDs, supported video URL forms, malformed metadata, and representative YouTube player-response shapes. The build script must produce a ZIP whose root contains `manifest.json`, not a nested project directory.

Manual smoke checks are intentionally short:

1. Load the unpacked extension in Chromium.
2. Confirm an unrelated YouTube video opens normally.
3. Confirm known Manifest and CRUSH channel URLs show the local 404 page.
4. Confirm representative matching watch and Shorts pages show the local 404 page.
5. Restart Chromium and confirm the unpacked extension remains enabled.

Completion requires passing automated tests, a successful clean build, validation of the ZIP contents, and a public GitHub repository containing the source, README, GPL-3.0 license, and workflow.
