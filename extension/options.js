const ENDPOINT = 'http://127.0.0.1:47821'
const status = document.getElementById('status')

function show(message, kind) {
  status.textContent = message
  status.className = `status ${kind || ''}`
}

// Pairing beats copy-paste for a first run, but the app has to have opened
// a window for it — otherwise anything installed here could ask for the
// token unprompted.
document.getElementById('pair').addEventListener('click', async () => {
  show('Asking Zbirka…')
  try {
    const res = await fetch(`${ENDPOINT}/pair`, { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return show(body.error || `Pairing refused (${res.status})`, 'err')
    await chrome.storage.local.set({ token: body.token })
    show('Connected. Right-click any image and choose Save to Zbirka.', 'ok')
  } catch {
    show('Zbirka is not running. Start the app and try again.', 'err')
  }
})

document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim()
  if (!token) return show('Nothing to save.', 'err')
  await chrome.storage.local.set({ token })
  show('Token saved.', 'ok')
})

chrome.storage.local.get('token').then(({ token }) => {
  if (token) show('A token is already stored. Connect again to replace it.')
})
