// The bridge between what the page knows and what the extension can act
// on. It answers exactly one question — "what media is the thing that
// was just right-clicked?" — and never touches the network itself.

const media = new Map()

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.__bowerbird !== 'x-media') return
  for (const [id, list] of event.data.entries) media.set(id, list)
  // A long scroll through a timeline would otherwise grow this forever.
  if (media.size > 400) {
    for (const key of [...media.keys()].slice(0, 200)) media.delete(key)
  }
})

// The menu click arrives long after the event that opened it, so the
// element under the cursor has to be remembered at the time.
let target = null
document.addEventListener('contextmenu', (event) => { target = event.target }, true)

const idIn = (href) => {
  const m = /\/status(?:es)?\/(\d+)/.exec(href ?? '')
  return m ? m[1] : null
}

function tweetAt(el) {
  const article = el?.closest?.('article')
  if (!article) return null
  for (const link of article.querySelectorAll('a[href*="/status/"]')) {
    const id = idIn(link.getAttribute('href'))
    if (id) return { id, article }
  }
  return null
}

// A tweet's own words make a far better library title than
// "GxK9tPnXwAA1b2c", which is all the file name would give.
function titleOf(article) {
  if (!article) return null
  const text = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim()
  const who = article
    .querySelector('[data-testid="User-Name"]')
    ?.textContent?.match(/@[\w]+/)?.[0]
  const body = text?.replace(/\s+/g, ' ').slice(0, 100)
  if (body && who) return `${body} — ${who}`
  return body || (who ? `${who} on X` : null)
}

const VIDEO_HOST =
  '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="previewInterstitial"], video'

function resolve(info) {
  const found = tweetAt(target)
  const id = idIn(info.linkUrl) ?? found?.id ?? idIn(location.pathname)
  const list = id ? media.get(id) : null

  // An <img> directly under the cursor is the only thing that says
  // which photo was meant in a four-photo tweet.
  const photo =
    target?.closest?.('[data-testid="tweetPhoto"]')?.querySelector('img') ??
    (target?.tagName === 'IMG' ? target : null)
  const direct = photo?.src?.includes('/media/') ? photo.src : null

  const wantsVideo = !!target?.closest?.(VIDEO_HOST)
  const video = list?.find((m) => m.variants?.length)
  const variants = video && (wantsVideo || !direct) ? video.variants : null

  return {
    tweetId: id ?? null,
    variants,
    url: variants ? null : direct,
    title: titleOf(found?.article ?? document.querySelector('article')),
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== 'bowerbird:resolve') return false
  try {
    reply(resolve(message.info ?? {}))
  } catch {
    reply(null)
  }
  return true
})
