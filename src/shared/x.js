// X (Twitter) media.
//
// Three facts about how X serves media shape everything in this file:
//
//   1. Timeline images are downscaled by a `name=` query parameter, so
//      the URL under the cursor is never the original. Saving what the
//      browser hands you means saving a thumbnail.
//   2. Video is played through MediaSource, so a <video> element's src
//      is a `blob:` URL that exists only inside that page. Nothing
//      outside the tab can fetch it. The real files are separate MP4
//      variants that the player never puts in the DOM.
//   3. Those variants are named only in the JSON X's own client fetches.
//
// So the extension reports whatever it managed to observe — a URL, a
// variant list, or just a tweet id — and the resolution happens here,
// in one tested place, rather than three times in three contexts.

const HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])

export function isXUrl(url) {
  try {
    return HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** The tweet id in a status permalink, or null. */
export function tweetIdFrom(url) {
  const m = /\/status(?:es)?\/(\d+)/.exec(String(url ?? ''))
  return m ? m[1] : null
}

const SIZES = /^(.*):(thumb|small|medium|large|orig)$/

/**
 * Rewrites a pbs.twimg.com URL to the undownscaled original.
 * Anything else is returned untouched.
 */
export function upgradeMediaUrl(input) {
  let u
  try {
    u = new URL(input)
  } catch {
    return input
  }
  if (u.hostname !== 'pbs.twimg.com') return input

  // `…/abc.jpg:large` is the older spelling of the same downscale.
  const suffixed = SIZES.exec(u.pathname)
  if (suffixed) u.pathname = suffixed[1]

  // The modern form carries the type as `format=` and no extension, so
  // an extension in the path has to move into the query to survive.
  const ext = /\.(jpe?g|png|webp|gif)$/i.exec(u.pathname)
  if (ext) {
    if (!u.searchParams.has('format')) {
      const type = ext[1].toLowerCase()
      u.searchParams.set('format', type === 'jpeg' ? 'jpg' : type)
    }
    u.pathname = u.pathname.slice(0, -ext[0].length)
  }
  u.searchParams.set('name', 'orig')
  return u.toString()
}

/**
 * Every progressive MP4 in an X `video_info.variants` array, largest
 * first. The HLS variant is skipped: it is a playlist of segments, and
 * turning that into a file needs a muxer this app deliberately does not
 * ship.
 *
 * All of them, not just the best one, because a variant that 404s should
 * cost the save some resolution rather than the whole video.
 */
export function orderedVariants(variants) {
  // The same list is spelled two ways by two X endpoints: `content_type`
  // and `url` in the API payload, `type` and `src` in the embed one.
  const mp4 = (Array.isArray(variants) ? variants : [])
    .map((v) => (v ? { ...v, url: v.url ?? v.src } : v))
    .filter((v) => v && typeof v.url === 'string' && /mp4/i.test(v.content_type ?? v.type ?? ''))
  // An animated GIF arrives as a single variant with no bitrate at all,
  // so sorting has to treat a missing bitrate as zero rather than skip.
  return mp4.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)).map((v) => v.url)
}

export const bestVariant = (variants) => orderedVariants(variants)[0] ?? null

// The public endpoint behind embedded tweets. It wants a token derived
// from the id — not a secret, just a cache-buster X computes the same
// way in its own embed script.
export const syndicationToken = (id) =>
  ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '')

export const syndicationUrl = (id) =>
  `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}` +
  `&token=${syndicationToken(id)}&lang=en`

/** Normalises a syndication payload down to a plain list of media. */
function collect(tweet) {
  const list = tweet?.mediaDetails ?? tweet?.extended_entities?.media ?? tweet?.photos ?? []
  const out = (Array.isArray(list) ? list : []).map((m) => ({
    type: m.type ?? (m.video_info ? 'video' : 'photo'),
    image: m.media_url_https ?? m.url ?? null,
    variants: m.video_info?.variants ?? [],
  }))
  // A single-video post sometimes carries its variants at the top level
  // instead of inside mediaDetails, in the embed player's own spelling.
  if (!out.some((m) => m.variants.length) && tweet?.video?.variants) {
    out.push({ type: 'video', image: tweet.video.poster ?? null, variants: tweet.video.variants })
  }
  return out.filter((m) => m.image || m.variants.length)
}

export function mediaFromSyndication(json) {
  const own = collect(json)
  // A post that quotes a video post has no media of its own: what is on
  // screen, and what the user right-clicked, belongs to the quoted one.
  return own.length ? own : collect(json?.quoted_tweet)
}

/**
 * Picks what to save out of a media list: video wins over photos,
 * because a tweet that has one is a tweet about it.
 */
export function pickFromMedia(media) {
  const withVideo = (media ?? []).find((m) => m.variants?.length)
  if (withVideo) {
    const url = bestVariant(withVideo.variants)
    if (url) return url
  }
  const photo = (media ?? []).find((m) => m.image)
  return photo ? upgradeMediaUrl(photo.image) : null
}
