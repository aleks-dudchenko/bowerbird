// The app listens on a fixed loopback port. Nothing is discovered or
// paired: the user copies a token out of the app's settings once, and
// that token is the only thing standing between a page and the library.
const ENDPOINT = 'http://127.0.0.1:47821/save'

// removeAll first: onInstalled fires again on every update and reload,
// and creating a duplicate id throws into the extension's error log.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-zbirka',
      title: 'Save to Zbirka',
      contexts: ['image', 'video'],
    })
  })
})

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.png'),
    title,
    message,
  })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-zbirka') return

  const { token } = await chrome.storage.local.get('token')
  if (!token) {
    notify('Zbirka', 'Open the extension options and paste your token first.')
    return
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        url: info.srcUrl,
        pageUrl: info.pageUrl || tab?.url || null,
      }),
    })

    if (res.status === 401) return notify('Zbirka', 'Token rejected. Check the options page.')
    if (res.status === 409) return notify('Zbirka', 'No library folder chosen in the app yet.')
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return notify('Zbirka', body.error || `Save failed (${res.status}).`)
    }
    const body = await res.json()
    notify('Saved to Zbirka', body.title || 'Added to your library.')
  } catch {
    // A refused connection means the desktop app simply is not running.
    notify('Zbirka', 'Zbirka is not running. Start the app and try again.')
  }
})
