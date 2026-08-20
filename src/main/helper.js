import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

const run = promisify(execFile)

// Built from helper/main.swift. In development it sits in build/; in a
// packaged app it is unpacked beside the asar because a binary inside an
// archive cannot be executed.
function candidates() {
  return [
    join(process.resourcesPath || '', 'bowerbird-helper'),
    join(app.getAppPath(), 'build', 'bowerbird-helper'),
    join(process.cwd(), 'build', 'bowerbird-helper'),
  ]
}

let cached = null
export async function helperPath() {
  if (cached) return cached
  for (const path of candidates()) {
    try {
      await access(path)
      cached = path
      return path
    } catch {
      /* try the next location */
    }
  }
  return null
}

/** Where the helper was looked for. Shown in Settings when it is missing. */
export const searchedPaths = () => candidates()

async function call(args, timeout = 30_000) {
  const bin = await helperPath()
  if (!bin) throw new Error('bowerbird-helper is missing — run `make -C helper`')
  const { stdout } = await run(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024 })
  const result = JSON.parse(stdout.trim().split('\n').pop())
  if (!result.ok) throw new Error(result.error || 'helper failed')
  return result
}

/** Video poster frame plus duration. Replaces the ffmpeg dependency. */
export const videoPoster = (input, output) => call(['poster', input, output])

/** QuickLook thumbnail — covers PDF, HEIC and anything the system previews. */
export const quickLookThumb = (input, output, size = 640) =>
  call(['thumbnail', input, output, String(size)])

/** Vision OCR. Language list comes from the OS, not from a guess. */
export const recogniseText = (input) => call(['ocr', input], 60_000)

export const ocrLanguages = () => call(['languages'])
