// Smoke test for the disk layer. Runs under Electron because library.js
// resolves the settings path through app.getPath.
//
// Fixtures are generated at runtime from dependencies the project
// already has. Nothing binary is committed, and the test passes on a
// fresh clone — an earlier version assumed files in /tmp and silently
// lied about its own coverage everywhere else.
import { app } from 'electron'

// Without this an async failure leaves Electron sitting on an error
// dialog forever, which reads as a hung test rather than a broken one.
process.on('unhandledRejection', (err) => {
  console.error('\nunhandled rejection:', err)
  app.exit(1)
})
import { rm, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyFile } from 'node:fs/promises'
import sharp from 'sharp'
import { ensureLibrary, loadIndex, spacesDir, cacheDir } from '../src/main/library.js'
import { ocrLanguages, helperPath } from '../src/main/helper.js'
import { ingestFile, updateSidecar, trashItem, restoreItem, backfillPalette, runOcr } from '../src/main/ingest.js'
import { createSpace, writeSpace, readSpace, listSpaces, removeSpace, newNodeId } from '../src/main/spaces.js'

// A minimal one-page PDF, written by hand so the test needs no library
// to produce one.
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R' +
  '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 20 100 Td (Bowerbird) Tj ET\nendstream\nendobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>'
)

const BASE = join(tmpdir(), `bowerbird-smoke-${process.pid}`)
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
  // Images are generated, but the video is a committed fixture: the app
  // no longer bundles an encoder, and requiring one just to run the tests
  // would put the licence problem straight back.
  await copyFile(
    new URL('../test/fixtures/clip.mp4', import.meta.url).pathname,
    join(SRC, 'clip.mp4')
  )
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
  ok('duration read via AVFoundation', clip.duration > 2.5 && clip.duration < 3.5, `${clip.duration}s`)
  ok('dimensions from poster', clip.width === 320 && clip.height === 180,
    `${clip.width}x${clip.height}`)

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

  console.log('\n5. System helper replaces ffmpeg')
  ok('the helper binary is present', !!(await helperPath()))
  const langs = await ocrLanguages()
  ok('OCR languages come from the OS', langs.languages.length > 10, `${langs.languages.length}`)
  ok('Ukrainian is among them', langs.languages.some((l) => l.startsWith('uk')))

  // A PDF has no thumbnail path through sharp at all; QuickLook is the
  // reason PDF and HEIC work without another image library.
  const pdfPath = join(SRC, 'doc.pdf')
  await writeFile(pdfPath, PDF_BYTES)
  const pdfItem = await ingestFile(ROOT, pdfPath)
  ok('a PDF imports', pdfItem.kind === 'image')
  ok('the PDF got a thumbnail via QuickLook', (await stat(pdfItem.thumb)).size > 0)

  const textPath = join(SRC, 'text.png')
  await sharp(Buffer.from(
    `<svg width="700" height="220" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="700" height="220" fill="white"/>` +
    `<text x="30" y="120" font-family="Helvetica" font-size="58" fill="black">Pricing plan</text></svg>`
  )).png().toFile(textPath)
  const textItem = await ingestFile(ROOT, textPath)
  const recognised = await runOcr({ ...textItem })
  ok('OCR reads text out of an image', /pricing/i.test(recognised.ocr || ''), JSON.stringify(recognised.ocr))
  ok('the OCR timestamp is recorded', !!recognised.ocrAt)

  console.log('\n6. A library from before the rename is carried over')
  // The cache folder used to be .zbirka. It is only a cache, but leaving
  // it would litter the user's own folder with a dead name forever — and
  // the migration has to run for a library already in use, not only for
  // one being chosen for the first time.
  const legacyCache = join(ROOT, '.zbirka')
  await rm(cacheDir(ROOT), { recursive: true, force: true })
  await mkdir(join(legacyCache, 'thumbs'), { recursive: true })
  await writeFile(join(legacyCache, 'thumbs', 'marker.webp'), 'x')
  await ensureLibrary(ROOT)
  ok('the old cache folder is renamed, not abandoned',
    !(await stat(legacyCache).catch(() => null)) && !!(await stat(cacheDir(ROOT)).catch(() => null)))
  ok('what was inside it came along',
    !!(await stat(join(cacheDir(ROOT), 'thumbs', 'marker.webp')).catch(() => null)))

  console.log('\n7. Old sidecars migrate on load')
  // Simulate a library written by the first version: no kind, no schema,
  // no fields added since. Every feature that branches on kind was
  // silently skipping these.
  const victim = added.find((a) => a.kind === 'image')
  const victimSidecar = victim.path.replace(/\.[^.]+$/, '.json')
  const original = JSON.parse(await readFile(victimSidecar, 'utf8'))
  const legacy = { ...original }
  for (const gone of ['kind', 'schema', 'colors', 'favourite', 'collections', 'autoTags', 'ocr', 'deletedAt']) {
    delete legacy[gone]
  }
  await writeFile(victimSidecar, JSON.stringify(legacy, null, 2))

  idx = await loadIndex(ROOT)
  const healed = idx.items.find((i) => i.id === victim.id)
  ok('kind is restored from the file extension', healed?.kind === 'image', String(healed?.kind))
  ok('the schema version is stamped', healed?.schema === 1)
  ok('array fields default rather than stay undefined',
    Array.isArray(healed?.collections) && Array.isArray(healed?.autoTags))
  const onDisk = JSON.parse(await readFile(victimSidecar, 'utf8'))
  ok('the repair is written back, not recomputed every launch', onDisk.kind === 'image')
  ok('user data survived the migration', onDisk.title === original.title)

  console.log('\n8. Palette and flags')
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

  const total = (await loadIndex(ROOT)).items.length
  console.log('\n9. Spaces')
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

  console.log('\n10. Trash keeps the file on disk')
  await trashItem(added[0])
  idx = await loadIndex(ROOT)
  ok('trashed item leaves the library', idx.items.length === total - 1, `${idx.items.length}`)
  ok('trashed item is listed separately', idx.trashed.length === 1)
  ok('the original file is untouched', (await stat(added[0].path)).size > 0)
  await restoreItem(added[0])
  idx = await loadIndex(ROOT)
  ok('restore brings it back', idx.items.length === total)

  console.log('\n11. Cache is rebuildable (the core architectural claim)')
  await rm(join(ROOT, '.bowerbird'), { recursive: true, force: true })
  idx = await loadIndex(ROOT)
  const spacesAfter = await listSpaces(ROOT)
  ok('all records survive deleting .bowerbird/', idx.items.length === total)
  ok('tags survive too', idx.items.find((i) => i.id === clip.id)?.tags.length === 2)
  ok('spaces survive — they are not cache', spacesAfter.length === 1 && spacesAfter[0].nodeCount === 3)

  await removeSpace(ROOT, space.id)
  ok('space deletion removes the file', (await listSpaces(ROOT)).length === 0)

  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
