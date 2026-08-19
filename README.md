# Zbirka

A local design-reference library for macOS. Offline, no account, no
subscription. Your files stay in an ordinary folder — the app does not
take ownership of them.

> **Status: feature-complete for a first release.** Everything on the
> roadmap through M6 is done and tested. Roadmap: [ROADMAP.md](ROADMAP.md).

## What it does

- **Collect** — drag files in, use the file dialog, or right-click any image
  on a web page and save it straight from the browser.
- **Arrange** — an infinite canvas with snapping, multi-select and zoom.
  Each board is a readable JSON file in your library folder.
- **Find** — full-text search over titles, tags, notes and text read out of
  the images themselves; filter by dominant colour; or describe what you
  remember and let a local CLIP model find it.
- **Keep** — files stay in an ordinary folder with a `.json` sidecar each.
  Delete the app and your library is still readable, still yours.

Everything runs on your machine. No account, no subscription, no telemetry,
no API keys.

## Requirements

macOS 13 or newer.

## Local AI

Search by description and automatic tagging use CLIP running on your own
machine. The model is about 150 MB and downloads the first time you ask for
it — never at install, and nothing is uploaded. Text inside images is read
with Apple's Vision framework, which supports 30 languages including
Ukrainian.

Open **Settings** to index your library, suggest tags, or read text out of
images. Suggested tags appear dashed in the detail panel and become real
tags only when you click one.

## Searching

Type to search titles, tags, notes and any text found inside images.
Prefixes match as you type and multiple words are ANDed. The colour strip
filters by dominant colour. `/` focuses search, `j` and `k` walk results,
`f` favourites, `t` jumps to tagging, `g` and `G` go to the ends.

## Principles

- **The folder is the source of truth.** Every file gets a `.json` sidecar
  next to it holding its tags and notes. The index is a cache that can be
  rebuilt at any time. Delete the app and the library is still readable.
- **Nothing leaves the machine.** Search runs locally, no API keys.
- **No accounts, no paywall, no telemetry.**

## Supported formats

Images: PNG, JPG, WEBP, GIF, AVIF, TIFF, SVG
Video: MP4, MOV, M4V, WEBM — a poster frame is extracted on import

## Running it

```
npm install
make -C helper   # the Swift binary used for video, OCR, PDF and HEIC
npm run dev      # start the app
npm run verify   # build + lint + unit tests + disk layer + save server
```

`npm run verify` needs port 47821 free, so close any running copy of the
app first — the save-server suite refuses to run against a foreign
process rather than silently testing the wrong one.

### Browser extension

Open **Settings** in the app and copy the connection token, then load
`extension/` in Chrome via `chrome://extensions` → Developer mode →
*Load unpacked*, open its options and paste the token. Right-click any
image or video on a page and choose **Save to Zbirka**.

The app listens on `127.0.0.1:47821` and only while it is running. The
token is the only credential; rotating it in Settings revokes the old one
immediately.

## Building a release

```
make -C helper
npm run dist
```

Builds are unsigned — signing and notarisation require a paid Apple
Developer account. macOS will refuse an unsigned app on first launch; to
allow it:

```
xattr -dr com.apple.quarantine /Applications/Zbirka.app
```

## Licence

MIT. Third-party licences are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); note that libvips inside
sharp is LGPL-3.0-or-later.

## Acknowledgements

Ideas borrowed from [DIIVO](https://shain.one/diivo/) and GatherOS, which
solve the same problem in their own ways. This is neither a fork nor a
port: the code is written from scratch and shares none of theirs.
