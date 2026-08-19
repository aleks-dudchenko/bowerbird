import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import sharp from 'sharp'
import { itemsDir, thumbsDir } from './library.js'

const SUPPORTED = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg',
])

export const isSupported = (p) => SUPPORTED.has(extname(p).toLowerCase())

async function sha256(path) {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

// Тумбнейл — webp 640px по довшій стороні. Вкладається в кеш, не в items/.
async function makeThumb(src, dest) {
  await sharp(src, { animated: false })
    .rotate()
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)
}

// Один файл → оригінал у items/YYYY/MM/, сайдкар поряд, тумбнейл у кеш.
export async function ingestFile(root, srcPath, extra = {}) {
  if (!isSupported(srcPath)) return { skipped: 'формат не підтримується', srcPath }

  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dir = join(itemsDir(root), yyyy, mm)
  await mkdir(dir, { recursive: true })

  const id = randomUUID().slice(0, 12)
  const ext = extname(srcPath).toLowerCase()
  const fileName = `${id}${ext}`
  const dest = join(dir, fileName)

  await copyFile(srcPath, dest)

  let width = null
  let height = null
  try {
    const meta = await sharp(dest).metadata()
    width = meta.width ?? null
    height = meta.height ?? null
  } catch {
    // svg без розмірів чи побитий файл — не привід падати
  }

  const thumb = join(thumbsDir(root), `${id}.webp`)
  try {
    await makeThumb(dest, thumb)
  } catch {
    // не вийшов тумбнейл — рендерер покаже оригінал
  }

  const meta = {
    id,
    file: fileName,
    title: basename(srcPath, ext),
    addedAt: now.toISOString(),
    sha256: await sha256(dest),
    width,
    height,
    tags: [],
    note: '',
    sourceUrl: extra.sourceUrl || null,
  }

  await writeFile(join(dir, `${id}.json`), JSON.stringify(meta, null, 2))
  return { ...meta, path: dest, thumb }
}

// Оновлення сайдкара — єдине місце, де правиться метадані.
export async function updateSidecar(item, patch) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  const meta = JSON.parse(await readFile(sidecar, 'utf8'))
  const next = { ...meta, ...patch }
  await writeFile(sidecar, JSON.stringify(next, null, 2))
  return next
}

// Видалення: оригінал + сайдкар + тумбнейл. Без кошика — M2.
export async function removeItem(item) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  for (const f of [item.path, sidecar, item.thumb]) {
    try {
      await unlink(f)
    } catch {
      /* уже немає — не проблема */
    }
  }
}
