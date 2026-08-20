# Contributing

Thanks for looking. This is a small, opinionated app; the fastest way to
get a change merged is to understand the two decisions everything else
follows from.

## The two rules

**1. The library folder is the source of truth.**
Every item is a file with a `.json` sidecar beside it. Every board is a
file in `spaces/`. Everything under `.bowerbird/` is a cache that can be
deleted at any moment and rebuilt from what remains. `npm run smoke`
asserts this literally: it deletes the cache mid-run and checks that no
record, tag or board was lost. A change that puts authored data in the
cache will fail that test, and should.

**2. Nothing leaves the machine.**
No telemetry, no accounts, no API keys, no remote calls except the one-off
model download the user triggers themselves. The browser extension talks
to `127.0.0.1` and nowhere else.

## Getting set up

```bash
npm ci
make -C helper     # builds the Swift binary used for video, OCR and PDF
npm run dev
```

macOS 13 or newer, because the helper uses Vision revision 3 and the async
`AVAssetImageGenerator` API.

## Running the checks

```bash
npm run verify     # build + unit tests + disk layer + save server
npm run test:clip  # separate: downloads ~150 MB of model weights
```

`npm test` covers the pure modules under `src/shared/` — canvas geometry,
search, palette extraction, vector maths. If you are changing behaviour
that can be expressed as a function of its inputs, it belongs there rather
than inside a component, so that it can be tested without a DOM.

## What tends to get asked

**Why not SQLite?** Because a native module rebuilt against Electron's ABI,
doubled for a universal build, is a real cost, and an inverted index over
one person's library answers in well under a millisecond. The trigger to
revisit is written down: a cold launch on a 50k-item library exceeding two
seconds.

**Why not a canvas library for the board?** Video has to play and images
want native lazy loading; both are free with DOM nodes and manual work on a
canvas. The migration trigger is a single board routinely exceeding ~5,000
nodes.

**Why is there a Swift binary?** It replaces a bundled ffmpeg whose prebuilt
binary declares itself not legally redistributable, and it does the same
work with hardware decoding in 222 KB instead of 43 MB. It also covers
Vision OCR and QuickLook thumbnails for PDF and HEIC.

## Style

Prettier config is in the repo; run `npx prettier --write` on what you
touch. Comments should explain why something is the way it is, especially
where the obvious approach was rejected — the code already says what it
does.
