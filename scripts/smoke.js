// Smoke test for the disk layer. Runs under Electron because library.js
// resolves the settings path through app.getPath.
import { app } from 'electron'
import { rm, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureLibrary, loadIndex, thumbsDir } from '../src/main/library.js'
import { ingestFile, updateSidecar, removeItem } from '../src/main/ingest.js'

const ROOT = '/tmp/zb-test/lib'
const SRC = '/tmp/zb-test/src'
let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

app.whenReady().then(async () => {
  await rm(ROOT, { recursive: true, force: true })
  await ensureLibrary(ROOT)

  const files = (await readdir(SRC)).sort().map((f) => join(SRC, f))
  const added = []
  for (const f of files) added.push(await ingestFile(ROOT, f))

  const images = added.filter((a) => a.kind === 'image')
  const videos = added.filter((a) => a.kind === 'video')

  console.log('\n1. Import')
  ok('every file accepted', added.length === files.length, `${added.length}/${files.length}`)
  ok('images detected', images.length === 5, `${images.length}`)
  ok('video detected', videos.length === 1, `${videos.length}`)
  ok('each has id, sha256, dimensions', added.every((a) => a.id && a.sha256 && a.width && a.height))

  console.log('\n2. Video specifics')
  const clip = videos[0]
  ok('poster frame written', (await stat(clip.thumb)).size > 0)
  ok('duration parsed from ffmpeg', clip.duration > 2.5 && clip.duration < 3.5, `${clip.duration}s`)
  ok('dimensions read from poster', clip.width === 640 && clip.height === 360, `${clip.width}x${clip.height}`)

  console.log('\n3. On-disk layout')
  ok('thumbnails for everything', (await readdir(thumbsDir(ROOT))).length === added.length)
  const sidecar = JSON.parse(await readFile(added[0].path.replace(/\.[^.]+$/, '.json'), 'utf8'))
  ok('sidecar sits next to the original', sidecar.id === added[0].id)

  console.log('\n4. Index rebuilds from sidecars')
  let index = await loadIndex(ROOT)
  ok('all records read back', index.length === added.length, `${index.length}`)
  ok('kind survives the round trip', index.filter((i) => i.kind === 'video').length === 1)

  console.log('\n5. Editing metadata')
  await updateSidecar(clip, { tags: ['motion', 'loop'], note: 'test' })
  index = await loadIndex(ROOT)
  const edited = index.find((i) => i.id === clip.id)
  ok('tags persisted', edited.tags.join() === 'motion,loop')
  ok('note persisted', edited.note === 'test')

  console.log('\n6. Cache is rebuildable (the core architectural claim)')
  await rm(join(ROOT, '.zbirka'), { recursive: true, force: true })
  index = await loadIndex(ROOT)
  ok('all records survive deleting .zbirka/', index.length === added.length, `${index.length}`)
  ok('tags survive too', index.find((i) => i.id === clip.id)?.tags.length === 2)

  console.log('\n7. Deletion')
  await removeItem(added[0])
  index = await loadIndex(ROOT)
  ok('one record removed', index.length === added.length - 1, `${index.length}`)

  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
