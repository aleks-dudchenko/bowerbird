// The app listens on a fixed loopback port. Pairing hands the extension
// a token once, and that token is the only thing standing between a page
// and the library.
const ENDPOINT = 'http://127.0.0.1:47821/save'

const X_PAGE = ['*://x.com/*', '*://twitter.com/*']

// Two items rather than one. The plain image/video contexts cover the
// whole web, but on X the player is a stack of divs over a blob: video,
// so a right-click there lands on the page background instead — and a
// page-context item everywhere else would offer to save nothing at all.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'bowerbird-save',
      title: 'Save to Bowerbird',
      contexts: ['image', 'video'],
    })
    chrome.contextMenus.create({
      id: 'bowerbird-save-x',
      title: 'Save to Bowerbird',
      contexts: ['page', 'link'],
      documentUrlPatterns: X_PAGE,
    })
  })
})

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title,
    message,
  })
}

const isX = (url) => /^https:\/\/(www\.)?(x|twitter)\.com\//.test(url ?? '')

// The content script knows which tweet was clicked and what media X's
// own API said it has. It may not be there — a tab open from before the
// extension loaded has no content script in it — so this never throws.
function askPage(tabId, info) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'bowerbird:resolve', info }, (reply) => {
      void chrome.runtime.lastError
      resolve(reply ?? null)
    })
  })
}

async function payloadFor(info, tab) {
  const pageUrl = info.pageUrl || tab?.url || null
  // A blob: URL is the video element's own src. It exists only inside
  // that tab, so sending it on would just produce a confusing failure.
  const src = info.srcUrl?.startsWith('blob:') ? null : info.srcUrl || null

  if (!isX(pageUrl) || tab?.id == null) return { url: src, pageUrl }

  const page = await askPage(tab.id, info)
  return {
    pageUrl,
    url: page?.variants ? null : page?.url || src,
    variants: page?.variants ?? null,
    // Without a tweet id and without a URL the app has nothing to work
    // with, so pass the id even when a URL was found: it is the fallback.
    tweetId: page?.tweetId ?? null,
    title: page?.title ?? null,
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'bowerbird-save' && info.menuItemId !== 'bowerbird-save-x') return

  const { token } = await chrome.storage.local.get('token')
  if (!token) {
    notify('Bowerbird', 'Open Settings in Bowerbird, click Pair extension, and try again.')
    return
  }

  const body = await payloadFor(info, tab)
  if (!body.url && !body.variants && !body.tweetId) {
    notify('Bowerbird', 'Nothing to save here — right-click the image or the video itself.')
    return
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })

    if (res.status === 401) return notify('Bowerbird', 'Token rejected. Pair the extension again.')
    if (res.status === 409) return notify('Bowerbird', 'No library folder chosen in the app yet.')
    if (!res.ok) {
      const failed = await res.json().catch(() => ({}))
      return notify('Bowerbird', failed.error || `Save failed (${res.status}).`)
    }
    const saved = await res.json()
    notify('Saved to Bowerbird', saved.title || 'Added to your library.')
  } catch {
    // A refused connection means the desktop app simply is not running.
    notify('Bowerbird', 'Bowerbird is not running. Start the app and try again.')
  }
})
