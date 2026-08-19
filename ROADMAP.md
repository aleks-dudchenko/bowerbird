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
└─ .zbirka/
   ├─ index.db                 SQLite cache (from M2)
   └─ thumbs/
```

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
| Index | sidecar JSON → in-memory (M1), SQLite + FTS5 (M2) | database only when search needs one |
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

**M2 — Search**
SQLite + FTS5 over title, note and tags. Collections. Colour search via
extracted palettes. Keyboard navigation: `j/k` move, `t` tag, `b` collect,
`f` favourite, `/` search. Trash instead of hard delete.

**M3 — Canvas**
Spaces: infinite canvas, pan and zoom, drag items, multi-select, snap
guides, positions persisted per space.

**M4 — AI and formats**
CLIP indexing with progress, semantic search, OCR helper, zero-shot
tagging. HEIC, PDF and Lottie previews. Rediscover mode.

**M5 — Browser extension**
MV3 extension, "Save to Zbirka" context menu, loopback HTTP with a token,
server only alive while the app is running.

**M6 — Release**
GitHub Actions building signed `.dmg` artefacts, contribution guide,
issue templates.

## Known risks

| Risk | Mitigation |
|---|---|
| Prebuilt sharp may lack libheif | verify before promising HEIC |
| CLIP weights ~150 MB on first run | download on first AI action, not at install |
| macOS Vision may not support `uk` | check `supportedRecognitionLanguages` at M4 and document the real list |
| `ffmpeg-static` binary needs asar unpacking when packaged | handle in electron-builder config at M6 |
| Electron bundle size (~120 MB dmg) | accepted cost of development speed |
| Unsigned builds need `xattr -dr com.apple.quarantine` | document in README until an Apple Developer certificate exists |
