# Third-party notices

Bowerbird is MIT licensed. It bundles or depends on the following, whose own
licences apply to those parts.

## Bundled in distributed builds

**Electron** — MIT. Includes Chromium (BSD-3-Clause) and Node.js (MIT).
https://github.com/electron/electron

**sharp** — Apache-2.0. https://github.com/lovell/sharp

**libvips**, bundled inside sharp's prebuilt binaries — **LGPL-3.0-or-later**.
Sources: https://github.com/libvips/libvips. The library is used unmodified
and dynamically loaded; you may replace it with your own build.

**React**, **React DOM** — MIT. https://github.com/facebook/react

**cuelume** — MIT. https://github.com/Danilaa1/cuelume
Interaction sounds, synthesized at runtime; no audio files are bundled.

**@huggingface/transformers** — Apache-2.0.
https://github.com/huggingface/transformers.js

**onnxruntime-node**, pulled in by the above — MIT.
https://github.com/microsoft/onnxruntime

### Model weights

`Xenova/clip-vit-base-patch32` is downloaded at runtime, on first use, at
the user's request. It is not redistributed with the application. CLIP was
released by OpenAI under the MIT licence.

## Not bundled

**FFmpeg** was previously used for video poster frames and has been removed.
The prebuilt binary shipped by `ffmpeg-static` reports "nonfree parts
compiled in. Therefore it is not legally redistributable", which is
incompatible with distributing this app at all. Its job is now done by
`helper/main.swift` through AVFoundation.

## Build-time only

electron-vite, Vite, electron-builder, ESLint, Prettier — all MIT.

## System frameworks

`bowerbird-helper` links Apple's AVFoundation, Vision, QuickLookThumbnailing
and CoreImage, which ship with macOS and are used under the Apple SDK
licence.
