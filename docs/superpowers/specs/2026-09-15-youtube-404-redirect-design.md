# YouTube 404 Redirect Design

## Purpose

Replace Route Sentinel's bundled generic error screen with YouTube's real 404 page. A blocked destination must remain in the current tab and display the authentic YouTube error experience, including YouTube's own mascot, branding, and search behavior.

## Behavior

When an existing blocking rule matches, the content script stops the current document and any media it has created, then calls `location.replace("https://www.youtube.com/404")`. `replace` keeps the navigation in the current tab and prevents the blocked destination from being retained as an extra browser-history entry.

The `/404` destination is neither a supported video URL nor a known blocked channel URL, so the content script allows it to load. YouTube owns the page markup, illustration, search form, and future visual updates.

## Packaging

The bundled `blocked.html` and `blocked.css` files become unused and are removed. The manifest no longer declares web-accessible resources, and the build archive contains only the manifest and the two JavaScript files.

## Documentation and Release

The README explains that matching destinations are replaced with YouTube's real 404 page in the same tab. The extension version advances to 1.1.0, and the public GitHub repository receives a corresponding release ZIP.

## Acceptance Criteria

- Blocking rules remain unchanged.
- A match navigates the current tab to `https://www.youtube.com/404` with `location.replace`.
- The YouTube 404 URL does not match a video or blocked-channel rule.
- No local blocked-page files or web-accessible resources remain in the packaged extension.
- Automated tests pass and the release ZIP has `manifest.json` at its archive root.
