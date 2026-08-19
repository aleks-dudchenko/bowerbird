import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { cacheDir } from './library.js'
import { normalise, nearest, pack, unpack } from '../shared/vector.js'

// Semantic search with CLIP, locally. One model produces embeddings for
// both images and text in the same space, which is what lets "a blue
// gradient with big type" find an image that carries no such words.
//
// Weights are ~150 MB and download on the first AI action, never at
// install. Everything after that is offline.

const MODEL = 'Xenova/clip-vit-base-patch32'
const DIMS = 512

let pipes = null
let loading = null

async function load(onProgress) {
  if (pipes) return pipes
  if (loading) return loading

  loading = (async () => {
    const { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, env } =
      await import('@huggingface/transformers')

    // Keep weights beside the app's own data rather than in a global npm
    // cache, so uninstalling the app takes them with it.
    env.cacheDir = join(app.getPath('userData'), 'models')
    env.allowLocalModels = false

    const progress_callback = onProgress
      ? (p) => p.status === 'progress' && onProgress({ file: p.file, progress: p.progress ?? 0 })
      : undefined

    const [processor, tokenizer, vision, text] = await Promise.all([
      AutoProcessor.from_pretrained(MODEL, { progress_callback }),
      AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
      CLIPVisionModelWithProjection.from_pretrained(MODEL, { progress_callback }),
      CLIPTextModelWithProjection.from_pretrained(MODEL, { progress_callback }),
    ])
    pipes = { processor, tokenizer, vision, text }
    return pipes
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

export async function embedImage(path, onProgress) {
  const { processor, vision } = await load(onProgress)
  const { RawImage } = await import('@huggingface/transformers')
  const image = await RawImage.read(path)
  const inputs = await processor(image)
  const { image_embeds } = await vision(inputs)
  return normalise(image_embeds.data)
}

export async function embedText(query, onProgress) {
  const { tokenizer, text } = await load(onProgress)
  const inputs = tokenizer([query], { padding: true, truncation: true })
  const { text_embeds } = await text(inputs)
  return normalise(text_embeds.data)
}

// Vectors are cache, not authored data: one flat file that can be deleted
// and rebuilt, never written into the sidecars.
const storePath = (root) => join(cacheDir(root), 'clip', 'vectors.json')

export async function loadStore(root) {
  try {
    const raw = JSON.parse(await readFile(storePath(root), 'utf8'))
    return unpack({ ids: raw.ids, dims: raw.dims, data: Float32Array.from(raw.data) })
  } catch {
    return new Map()
  }
}

export async function saveStore(root, entries) {
  const packed = pack(entries, DIMS)
  await mkdir(dirname(storePath(root)), { recursive: true })
  await writeFile(
    storePath(root),
    JSON.stringify({ ids: packed.ids, dims: packed.dims, data: Array.from(packed.data) })
  )
}

export async function semanticSearch(root, query, k = 40) {
  const entries = await loadStore(root)
  if (!entries.size) return []
  return nearest(await embedText(query), entries, k)
}

export { DIMS, MODEL }
