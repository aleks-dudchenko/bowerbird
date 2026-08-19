import { app } from 'electron'
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

// Розкладка бібліотеки. Ключове рішення проєкту: папка — джерело правди.
//
//   MyLibrary/
//   ├─ items/2026/08/<id>.png     оригінал
//   ├─ items/2026/08/<id>.json    сайдкар: теги, нотатки, джерело
//   └─ .zbirka/thumbs/<id>.webp   кеш, завжди відновлюваний
//
// Усе в .zbirka/ можна видалити — індекс перебудується з сайдкарів.

const SETTINGS = () => join(app.getPath('userData'), 'settings.json')

export async function readSettings() {
  try {
    return JSON.parse(await readFile(SETTINGS(), 'utf8'))
  } catch {
    return {}
  }
}

export async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch }
  await mkdir(dirname(SETTINGS()), { recursive: true })
  await writeFile(SETTINGS(), JSON.stringify(next, null, 2))
  return next
}

export const itemsDir = (root) => join(root, 'items')
export const cacheDir = (root) => join(root, '.zbirka')
export const thumbsDir = (root) => join(root, '.zbirka', 'thumbs')

export async function ensureLibrary(root) {
  await mkdir(itemsDir(root), { recursive: true })
  await mkdir(thumbsDir(root), { recursive: true })
  return root
}

// Рекурсивний обхід items/ — повертає шляхи всіх сайдкарів.
async function walkSidecars(dir, out = []) {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walkSidecars(full, out)
    else if (e.name.endsWith('.json')) out.push(full)
  }
  return out
}

// Індекс будується з сайдкарів на кожному старті. Повільніше за БД,
// але доводить, що бібліотека самодостатня. SQLite додається в M2,
// коли зʼявиться повнотекстовий пошук.
export async function loadIndex(root) {
  const files = await walkSidecars(itemsDir(root))
  const items = []
  for (const f of files) {
    try {
      const meta = JSON.parse(await readFile(f, 'utf8'))
      const file = join(dirname(f), meta.file)
      await stat(file) // оригінал зник — пропускаємо запис
      items.push({ ...meta, path: file, thumb: join(thumbsDir(root), `${meta.id}.webp`) })
    } catch {
      // побитий сайдкар або відсутній оригінал — тихо пропускаємо
    }
  }
  items.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
  return items
}
