// Smoke test for the disk layer. Runs under Electron because library.js
// resolves the settings path through app.getPath.
//
// Fixtures are generated at runtime from dependencies the project
// already has. Nothing binary is committed, and the test passes on a
// fresh clone — an earlier version assumed files in /tmp and silently
// lied about its own coverage everywhere else.
import { app } from 'electron'
import { rm, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { ensureLibrary, loadIndex, thumbsDir, spacesDir } from '../src/main/library.js'
import { ingestFile, updateSidecar, trashItem, restoreItem, backfillPalette } from '../src/main/ingest.js'
import { createSpace, writeSpace, readSpace, listSpaces, removeSpace, newNodeId } from '../src/main/spaces.js'

const run = promisify(execFile)
const BASE = join(tmpdir(), `zbirka-smoke-${process.pid}`)
const SRC = join(BASE, 'src')
const ROOT = join(BASE, 'lib')

let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

async function makeFixtures() {
  await mkdir(SRC, { recursive: true })
  const colours = [[220, 80, 80], [80, 140, 220], [240, 200, 90], [120, 200, 140], [200, 120, 220]]
  for (const [i, [r, g, b]] of colours.entries()) {
    await sharp({
      create: { width: 400 + i * 120, height: 300 + i * 80, channels: 3, background: { r, g, b } },
    })
      .png()
      .toFile(join(SRC, `sample-${i + 1}.png`))
  }
  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25',
    '-t', '3', '-pix_fmt', 'yuv420p', '-y', join(SRC, 'clip.mp4'),
  ])
}

app.whenReady().then(async () => {
  await rm(BASE, { recursive: true, force: true })
  await makeFixtures()
  await ensureLibrary(ROOT)

  const files = (await readdir(SRC)).sort().map((f) => join(SRC, f))
  const added = []
  for (const f of files) added.push(await ingestFile(ROOT, f))
  const clip = added.find((a) => a.kind === 'video')

  console.log('\n1. Import')
  ok('every fixture accepted', added.length === files.length, `${added.length}/${files.length}`)
  ok('images and video classified', added.filter((a) => a.kind === 'image').length === 5 && !!clip)
  ok('each has id, sha256, dimensions', added.every((a) => a.id && a.sha256 && a.width && a.height))
  ok('ids are 12 hex chars, no dash', added.every((a) => /^[0-9a-f]{12}$/.test(a.id)))

  console.log('\n2. Video')
  ok('poster frame written', (await stat(clip.thumb)).size > 0)
  ok('duration parsed', clip.duration > 2.5 && clip.duration < 3.5, `${clip.duration}s`)
  ok('dimensions from poster', clip.width === 640 && clip.height === 360)

  console.log('\n3. Index rebuilds from sidecars')
  let idx = await loadIndex(ROOT)
  ok('all records read back', idx.items.length === added.length, `${idx.items.length}`)
  ok('kind survives the round trip', idx.items.filter((i) => i.kind === 'video').length === 1)
  ok('sha map built for dupe detection', idx.bySha.length === added.length)

  console.log('\n4. Editing metadata')
  await updateSidecar(clip, { tags: ['motion', 'loop'], note: 'test' })
  idx = await loadIndex(ROOT)
  ok('tags persisted', idx.items.find((i) => i.id === clip.id).tags.join() === 'motion,loop')
  ok('note persisted', idx.items.find((i) => i.id === clip.id).note === 'test')

  console.log('\n5. Palette and flags')
  const red = added.find((a) => a.title === 'sample-1')
  ok('a palette was extracted on import', red.colors.length > 0, `${red.colors.length} colours`)
  ok('the dominant colour matches the fixture',
    Math.abs(red.colors[0][0] - 220) < 40 && red.colors[0][1] < 140,
    JSON.stringify(red.colors[0]))
  ok('sidecars carry a schema version', added.every((a) => a.schema === 1))
  ok('new items start unfavourited and uncollected',
    added.every((a) => a.favourite === false && Array.isArray(a.collections)))

  await updateSidecar(red, { favourite: true, collections: ['work'] })
  idx = await loadIndex(ROOT)
  const flagged = idx.items.find((i) => i.id === red.id)
  ok('favourite persists', flagged.favourite === true)
  ok('collection membership persists', flagged.collections.join() === 'work')

  // Libraries built before the palette field existed must be able to
  // catch up without a blocking migration at launch.
  await updateSidecar(red, { colors: [] })
  const refilled = await backfillPalette({ ...red, thumb: red.thumb })
  ok('backfill recomputes a missing palette', refilled.colors.length > 0)

  console.log('\n6. Spaces')
  let space = await createSpace(ROOT, 'Test board')
  space = await writeSpace(ROOT, {
    ...space,
    nodes: added.slice(0, 3).map((item, i) => ({
      nodeId: newNodeId(), type: 'item', itemId: item.id,
      x: 100 * i, y: 50 * i, w: 320, h: 240, z: i + 1, rotation: 0, opacity: 1,
    })),
  })
  const reread = await readSpace(ROOT, space.id)
  ok('space persisted with 3 nodes', reread.nodes.length === 3)
  ok('coordinates survive exactly', reread.nodes[2].x === 200 && reread.nodes[2].y === 100)
  ok('node ids differ from item ids', reread.nodes.every((n) => n.nodeId !== n.itemId))
  ok('space lives beside items/, not in the cache',
    (await readdir(spacesDir(ROOT))).includes(`${space.id}.json`))
  const summary = await listSpaces(ROOT)
  ok('list returns a summary, not full nodes',
    summary[0].nodeCount === 3 && summary[0].nodes === undefined)

  console.log('\n7. Trash keeps the file on disk')
  await trashItem(added[0])
  idx = await loadIndex(ROOT)
  ok('trashed item leaves the library', idx.items.length === added.length - 1)
  ok('trashed item is listed separately', idx.trashed.length === 1)
  ok('the original file is untouched', (await stat(added[0].path)).size > 0)
  await restoreItem(added[0])
  idx = await loadIndex(ROOT)
  ok('restore brings it back', idx.items.length === added.length)

  console.log('\n8. Cache is rebuildable (the core architectural claim)')
  await rm(join(ROOT, '.zbirka'), { recursive: true, force: true })
  idx = await loadIndex(ROOT)
  const spacesAfter = await listSpaces(ROOT)
  ok('all records survive deleting .zbirka/', idx.items.length === added.length)
  ok('tags survive too', idx.items.find((i) => i.id === clip.id)?.tags.length === 2)
  ok('spaces survive — they are not cache', spacesAfter.length === 1 && spacesAfter[0].nodeCount === 3)

  await removeSpace(ROOT, space.id)
  ok('space deletion removes the file', (await listSpaces(ROOT)).length === 0)

  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
