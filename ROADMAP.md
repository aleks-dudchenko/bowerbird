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

**M4 — Search** ✅
Full-text over title, tags, note and OCR from an inverted index built in
the renderer — no SQLite. Compound words are indexed whole and split, so
`DarkModeDashboard` is findable by `dashboard`. Prefix matching means
results appear while typing, tags outrank titles, and multiple terms are
ANDed. Colour search from a five-colour palette extracted at import, with
backfill for older libraries. Favourites, collections, a trash view that
restores, and `j/k` `g/G` `f` `t` `/` keyboard navigation.

No SQLite unless a cold launch on a 50k-item library exceeds two seconds —
that is the trigger to revisit, not a hunch.

**M5 — AI and formats** ✅
A single Swift helper (`helper/main.swift`, 222 KB universal) covering
Vision OCR, AVFoundation poster frames and QuickLook thumbnails. It
**removed the ffmpeg dependency entirely** — the bundled binary reported
"nonfree parts compiled in. Therefore it is not legally redistributable",
which blocked any release. HEIC and PDF ride the same QuickLook path.

Vision reports 30 OCR languages on macOS 26, Ukrainian among them — the
list is read from the OS rather than hard-coded.

Local CLIP (`Xenova/clip-vit-base-patch32`) for search by description.
Weights download on first use, never at install. Vectors live in
`.zbirka/clip/` as cache, never in sidecars. Zero-shot tags land in
`autoTags` and are promoted to real tags only by a click, so a guess never
overwrites what a person typed.

**M6 — Release** ✅
electron-builder producing arm64 and x64 dmgs, GitHub Actions for CI and
tagged releases, ESLint and Prettier, contribution guide, issue templates
and third-party licence notices.

Builds are **unsigned**: signing and notarisation need a paid Apple
Developer account. Until there is one, the release notes carry the
`xattr -dr com.apple.quarantine` instruction, which is an honest trade for
a free tool rather than a papered-over one.

## Known risks

| Risk | Mitigation |
|---|---|
| ~~`ffmpeg-static` is not redistributable~~ | **Resolved.** Removed in M5; AVFoundation does the work through the helper |
| CLIP weights ~150 MB on first run | download on first AI action, not at install |
| macOS Vision may not support `uk` | check `supportedRecognitionLanguages` at M4 and document the real list |
| HEIC | resolved — the bundled libvips reports `heif` input support, so it is an extension-list change |
| PDF | sharp cannot decode it; QuickLook via the M5 helper covers PDF and HEIC in one path |
| Electron bundle size | accepted cost of development speed; dropping ffmpeg took 43 MB off it |
| Unsigned builds need `xattr -dr com.apple.quarantine` | document in README until an Apple Developer certificate exists |


## What running the packaged build taught us

Four defects survived every unit test and only appeared once the app was
built and launched as a real bundle. All four shared a shape: a failure
with nowhere to report itself.

- **No sidecar migration.** Items imported before the `kind` field existed
  carried `kind: null`, and every feature that branches on it skipped them
  in silence. Libraries outlive the code that wrote them; there is now a
  migration on load.
- **`writeAtomic` raced with itself.** A fixed `${path}.tmp` meant two
  concurrent writers shared one scratch file and the second `rename` threw
  ENOENT. Settings are patched from four places at once, so this was
  reachable in ordinary use.
- **The save server failed to bind silently.** The status line said "not
  listening" with no reason. Worse, the test slept and hoped rather than
  checking it owned the port, and spent a debugging session talking to a
  different running copy of the app.
- **Background jobs did not refresh the UI.** OCR wrote text to disk and
  the renderer never reloaded, so searching for a word plainly visible in
  the picture returned nothing until a restart.

The lesson worth keeping: a `catch {}` that swallows an error turns a bug
into a mystery. Every one of these was found by making the failure speak.
