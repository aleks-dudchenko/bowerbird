import sharp from 'sharp'
import { palette } from '../shared/palette.js'

// 48px is plenty: dominant colour survives downsampling, and decoding a
// 6000px original for this would dominate import time.
export async function extractPalette(path) {
  try {
    const { data, info } = await sharp(path)
      .resize(48, 48, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    return palette(data, info.channels)
  } catch {
    return []
  }
}
