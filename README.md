# Zbirka

A local design-reference library for macOS. Offline, no account, no
subscription. Your files stay in an ordinary folder — the app does not
take ownership of them.

> **Status: M2 — boards work.** Drag-and-drop import, sidecars, thumbnails,
> masonry grid, editable tags and notes, video poster frames, and an
> infinite canvas whose layout is a plain JSON file in your library folder.
> Real search is still to come; a substring filter and tag rail stand in.
> Roadmap: [ROADMAP.md](ROADMAP.md).

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
npm run dev     # start the app
npm run smoke   # 24 checks against the disk layer, fixtures generated at runtime
```

## Licence

MIT.

## Acknowledgements

Ideas borrowed from [DIIVO](https://shain.one/diivo/) and GatherOS, which
solve the same problem in their own ways. This is neither a fork nor a
port: the code is written from scratch and shares none of theirs.
