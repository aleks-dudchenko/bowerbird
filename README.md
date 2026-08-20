# Bowerbird

A local design-reference library for macOS. Offline, no account, no
subscription. Your files stay in an ordinary folder — the app does not
take ownership of them.

> **Status: ready for a first release.** Everything on the roadmap through
> M6 is built, tested and verified in a packaged build.
> Roadmap: [ROADMAP.md](ROADMAP.md).

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

The interface is deliberately monochrome. This is a library of other
people's colour, and any hue in the chrome competes with the work — most
concretely, it makes judging a palette in the colour filter harder. Red
appears in exactly one place and means one thing: this destroys
something.

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
make -C helper   # required: the Swift binary for video, OCR, PDF and HEIC
npm run dev      # start the app
npm run verify   # build + lint + unit tests + disk layer + save server
```

`npm run verify` needs port 47821 free, so close any running copy of the
app first — the save-server suite refuses to run against a foreign
process rather than silently testing the wrong one.

### Browser extension

Works in any Chromium browser — Comet, Chrome, Brave, Edge, Arc. It is not
on any web store and is not meant to be: load it unpacked from this repo.

1. In Bowerbird, open **Settings** and click **Show the extension folder**.
2. In the browser open its extensions page (`comet://extensions`,
   `chrome://extensions`, `brave://extensions` …).
3. Turn on **Developer mode**, choose **Load unpacked**, pick that folder.
4. Open the extension's options and click **Pair extension** in Bowerbird's
   Settings. The page notices and connects on its own — nothing to copy.

If you change anything in `extension/`, press the reload icon on its card
in the browser: an unpacked extension keeps the copy it loaded until told
otherwise.

Right-click any image or video on a page → **Save to Bowerbird**.

#### X (Twitter)

Three things make X a special case, and the extension handles all three.

Timeline images are downscaled by a `name=` query parameter, so the URL
under your cursor is a thumbnail — the app rewrites it to the original and
keeps the rendered size as a fallback in case that guess is wrong.

Video is played through MediaSource, so the `<video>` element's `src` is a
`blob:` URL that exists only inside that tab. Nothing outside it can fetch
that. The real files are separate MP4 variants named only in the JSON X's
own client fetches, so a content script reads them out of that traffic and
hands the list over; the app takes the largest that downloads.

X's player is a stack of `div`s, so a right-click usually lands on the page
rather than on the video. On x.com the menu item therefore also appears on
the page background — right-click anywhere in the post.

If the content script missed the post (a tab that was already open when the
extension loaded), the app falls back to X's public embed endpoint using
the post id. A post that quotes a video post resolves to the quoted video,
which is the thing on screen.

Videos that exist only as HLS are not saved: turning a playlist of segments
into a file needs a muxer, and shipping one would mean shipping ffmpeg,
which cannot be redistributed under this licence.

The app listens on `127.0.0.1:47821`, only while it is running. Pairing
only answers while you have opened a two-minute window from inside the
app, only to a caller whose origin is an extension — a web page cannot
forge that header — and only once per window. Rotating the token in
Settings revokes the old one at once. Keep the folder where it is — a Chromium browser identifies an
unpacked extension by its path, so moving it means loading it again.

## Building a release

```
make -C helper
npm run dist
```

Builds are unsigned — signing and notarisation require a paid Apple
Developer account. macOS will refuse an unsigned app on first launch; to
allow it:

```
xattr -dr com.apple.quarantine /Applications/Bowerbird.app
```

## Licence

MIT. Third-party licences are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); note that libvips inside
sharp is LGPL-3.0-or-later.

## Acknowledgements

Ideas borrowed from [DIIVO](https://shain.one/diivo/) and GatherOS, which
solve the same problem in their own ways. This is neither a fork nor a
port: the code is written from scratch and shares none of theirs.
