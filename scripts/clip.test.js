// Exercises CLIP for real: the model downloads on first run (~150 MB),
// then this is offline. Kept out of `npm run verify` because a network
// fetch does not belong in the default loop.
import { app } from 'electron'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

process.on('unhandledRejection', (err) => {
  console.error('\nunhandled rejection:', err)
  app.exit(1)
})

const BASE = join(tmpdir(), `zbirka-clip-${process.pid}`)
app.setPath('userData', join(BASE, 'userData'))

const { embedImage, embedText, DIMS } = await import('../src/main/clip.js')
const { cosine } = await import('../src/shared/vector.js')

let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

app.whenReady().then(async () => {
  await mkdir(BASE, { recursive: true })
  console.log('\ndownloading model on first run, this takes a minute…')

  const files = {}
  for (const [name, svg] of [
    ['sunset', `<svg width="384" height="384" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1055"/><stop offset="0.6" stop-color="#e0562c"/>
      <stop offset="1" stop-color="#ffc371"/></linearGradient></defs>
      <rect width="384" height="384" fill="url(#g)"/>
      <circle cx="192" cy="250" r="52" fill="#fff3c4"/></svg>`],
    ['grid', `<svg width="384" height="384" xmlns="http://www.w3.org/2000/svg">
      <rect width="384" height="384" fill="#ffffff"/>
      ${Array.from({ length: 8 }, (_, i) =>
        `<rect x="${20 + i * 45}" y="40" width="30" height="300" fill="#111"/>`).join('')}
      </svg>`],
  ]) {
    files[name] = join(BASE, `${name}.png`)
    await sharp(Buffer.from(svg)).png().toFile(files[name])
  }

  const t0 = Date.now()
  const sunset = await embedImage(files.sunset)
  console.log(`  (model ready in ${Math.round((Date.now() - t0) / 1000)}s)\n`)
  const grid = await embedImage(files.grid)

  console.log('1. Embeddings')
  ok('an image embedding has the expected width', sunset.length === DIMS, `${sunset.length}`)
  ok('embeddings are unit length', Math.abs(Math.hypot(...sunset) - 1) < 1e-3)
  ok('the same image twice gives the same vector', cosine(sunset, await embedImage(files.sunset)) > 0.999)
  ok('different images give different vectors', cosine(sunset, grid) < 0.95)

  console.log('\n2. Text and image share one space')
  const qSunset = await embedText('an orange sunset gradient with a glowing sun')
  const qGrid = await embedText('a black and white striped geometric pattern')
  ok('the sunset query prefers the sunset image',
    cosine(qSunset, sunset) > cosine(qSunset, grid),
    `${cosine(qSunset, sunset).toFixed(3)} vs ${cosine(qSunset, grid).toFixed(3)}`)
  ok('the pattern query prefers the pattern image',
    cosine(qGrid, grid) > cosine(qGrid, sunset),
    `${cosine(qGrid, grid).toFixed(3)} vs ${cosine(qGrid, sunset).toFixed(3)}`)

  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
