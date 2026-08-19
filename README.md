# Zbirka

A local design-reference library for macOS. Offline, no account, no
subscription. Your files stay in an ordinary folder — the app does not
take ownership of them.

> **Status: M4 — search works.** Import by drag, by dialog or from the
> browser; an infinite canvas whose layout is a plain JSON file; full-text
> and colour search; favourites, collections and a recoverable trash.
> Roadmap: [ROADMAP.md](ROADMAP.md).

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
npm run dev      # start the app
npm run verify   # build + unit tests + disk layer + save server
```

### Browser extension

Open **Settings** in the app and copy the connection token, then load
`extension/` in Chrome via `chrome://extensions` → Developer mode →
*Load unpacked*, open its options and paste the token. Right-click any
image or video on a page and choose **Save to Zbirka**.

The app listens on `127.0.0.1:47821` and only while it is running. The
token is the only credential; rotating it in Settings revokes the old one
immediately.

## Licence

MIT.

## Acknowledgements

Ideas borrowed from [DIIVO](https://shain.one/diivo/) and GatherOS, which
solve the same problem in their own ways. This is neither a fork nor a
port: the code is written from scratch and shares none of theirs.
