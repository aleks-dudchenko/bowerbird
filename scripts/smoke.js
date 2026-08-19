// Димовий тест шару роботи з диском. Запускається в Electron, бо
// library.js бере шлях до налаштувань через app.getPath.
import { app } from 'electron'
import { rm, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureLibrary, loadIndex, thumbsDir } from '../src/main/library.js'
import { ingestFile, updateSidecar, removeItem } from '../src/main/ingest.js'

const ROOT = '/tmp/zb-test/lib'
const SRC = '/tmp/zb-test/src'
const ok = (label, cond, extra = '') =>
  console.log(`${cond ? '  ✓' : '  ✗ ПРОВАЛ'} ${label}${extra ? ' — ' + extra : ''}`)

app.whenReady().then(async () => {
  await rm(ROOT, { recursive: true, force: true })
  await ensureLibrary(ROOT)

  const files = (await readdir(SRC)).map((f) => join(SRC, f))
  const added = []
  for (const f of files) added.push(await ingestFile(ROOT, f))

  console.log('\n1. Імпорт')
  ok('усі 5 файлів прийнято', added.length === 5, `${added.length}`)
  ok('у кожного є id, sha256, розміри', added.every((a) => a.id && a.sha256 && a.width && a.height))

  console.log('\n2. Розкладка на диску')
  const thumbs = await readdir(thumbsDir(ROOT))
  ok('тумбнейли створені', thumbs.length === 5, `${thumbs.length} шт`)
  const sidecar = JSON.parse(await readFile(added[0].path.replace(/\.[^.]+$/, '.json'), 'utf8'))
  ok('сайдкар лежить поряд з оригіналом', sidecar.id === added[0].id)

  console.log('\n3. Індекс будується з сайдкарів')
  let index = await loadIndex(ROOT)
  ok('прочитано 5 записів', index.length === 5, `${index.length}`)
  ok('відсортовано за датою додавання', index[0].addedAt >= index[index.length - 1].addedAt)

  console.log('\n4. Редагування метаданих')
  await updateSidecar(added[0], { tags: ['brutalist', 'poster'], note: 'тест' })
  index = await loadIndex(ROOT)
  const edited = index.find((i) => i.id === added[0].id)
  ok('теги збереглися в сайдкарі', edited.tags.join() === 'brutalist,poster')
  ok('нотатка збереглася', edited.note === 'тест')

  console.log('\n5. Кеш відновлюваний (головне архітектурне твердження)')
  await rm(join(ROOT, '.zbirka'), { recursive: true, force: true })
  index = await loadIndex(ROOT)
  ok('після видалення .zbirka/ всі 5 записів на місці', index.length === 5, `${index.length}`)
  ok('теги пережили видалення кешу', index.find((i) => i.id === added[0].id)?.tags.length === 2)

  console.log('\n6. Видалення')
  await removeItem(added[0])
  index = await loadIndex(ROOT)
  ok('лишилось 4 записи', index.length === 4, `${index.length}`)

  console.log()
  app.exit(0)
})
