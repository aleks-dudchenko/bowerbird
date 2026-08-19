# Zbirka — roadmap

A local design-reference library: offline, no account, files stay yours.

## Core architectural decision: the folder is the source of truth

Most tools in this space keep state in a database and offer "sync" by
placing that database in Dropbox or iCloud. A SQLite file in a synced
folder corrupts sooner or later once two machines touch it.

This layout avoids the problem:

```
MyLibrary/                     ← safe to put in Dropbox / iCloud
├─ items/
│  ├─ 2026/08/a7f3k2.png       original
│  └─ 2026/08/a7f3k2.json      sidecar: tags, note, source, dimensions
├─ spaces/
│  └─ s7f2k1.json              a board: positioned references
└─ .zbirka/                    rebuildable cache, safe to delete
   ├─ thumbs/
   └─ previews/
```

Note that `spaces/` sits beside `items/`, not inside the cache. A board is
authored work, not something derivable — deleting the cache must never
destroy one.

- `items/` syncs as ordinary files — no conflicts.
- `.zbirka/` is **local to each machine** and fully rebuildable. Delete it
  and the app reconstructs everything from the sidecars.
- The library stays readable without the app, ports anywhere, and can be
  committed to git.

`npm run smoke` asserts this directly: it deletes `.zbirka/` mid-run and
verifies that every record and tag survives.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron + electron-builder | no Rust toolchain needed; plenty of prior art |
| UI | React + Vite | fast HMR, standard |
| Images | sharp | thumbnails, resizing, metadata |
| Video | ffmpeg-static | poster frame + duration on import |
| Index | sidecar JSON → in-memory | a database only if measurements demand one (see M4) |
| AI | @huggingface/transformers (ONNX) | CLIP locally, offline after first download |
| OCR | macOS Vision via a small Swift helper | better than tesseract, Ukrainian included |
| Canvas | plain DOM + CSS transforms | simpler than konva for a first pass |

## Milestones

**M0 — Skeleton** ✅
Electron + Vite + React window, MIT licence, first commit.

**M1 — Library** ✅
Library folder picker, drag-and-drop import, originals copied with
sidecars, thumbnails, masonry grid, detail panel, tag and note editing,
deletion. Video (MP4/MOV/M4V/WEBM) with extracted poster frames.

The order changed after M1: the canvas moved ahead of search because it is
what makes this different from a folder with thumbnails, and the browser
extension moved ahead of search too — search only earns its keep once the
library is large, and the extension is what makes it large.

**M2 — Spaces** ✅
Boards stored as plain JSON beside `items/`. Infinite canvas on plain DOM:
pan, zoom to cursor, drag with snap guides, marquee multi-select, keyboard
nudging. Drop files straight onto the canvas to import and place in one
gesture. A tray and tag rail stand in for search until it arrives. Trash
that stamps `deletedAt` rather than deleting, with undo.

**M3 — Browser extension** ✅
MV3 extension with a "Save to Zbirka" context menu. The app listens on
`127.0.0.1:47821` only while it is open, guarded by a bearer token the
user pastes once. Downloads happen in the main process, formats come from
an explicit allowlist and images must actually decode before they are
accepted. Fills `sourceUrl`, which has been in the sidecar since M1.

**M4 — Search**
Full-text over title, note and tags from an in-memory inverted index with a
snapshot on disk — no SQLite unless a cold launch on a 50k-item library
exceeds two seconds. Collections, colour search from stored palettes,
keyboard navigation: `j/k` move, `t` tag, `b` collect, `f` favourite,
`/` search.

**M5 — AI and formats**
Local CLIP for semantic search. A single Swift helper covering Vision OCR,
AVFoundation poster frames and QuickLook thumbnails — which also removes
the ffmpeg dependency entirely. HEIC and PDF. Zero-shot auto-tags, kept in
their own field so they never overwrite what a human typed.

**M6 — Release**
GitHub Actions, electron-builder, contribution guide, issue templates,
third-party licence notices.

## Known risks

| Risk | Mitigation |
|---|---|
| **`ffmpeg-static` is not redistributable** — the bundled binary reports "nonfree parts compiled in", and the package is GPL-3.0 | **Blocks any binary release.** Replaced by the Swift helper in M5; until then it is a local-development dependency only |
| CLIP weights ~150 MB on first run | download on first AI action, not at install |
| macOS Vision may not support `uk` | check `supportedRecognitionLanguages` at M4 and document the real list |
| HEIC | resolved — the bundled libvips reports `heif` input support, so it is an extension-list change |
| PDF | sharp cannot decode it; QuickLook via the M5 helper covers PDF and HEIC in one path |
| Electron bundle size (~120 MB dmg) | accepted cost of development speed |
| Unsigned builds need `xattr -dr com.apple.quarantine` | document in README until an Apple Developer certificate exists |
