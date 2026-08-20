const ENDPOINT = 'http://127.0.0.1:47821'
const POLL_MS = 1500

const state = document.getElementById('state')
const stateText = document.getElementById('state-text')
const pairButton = document.getElementById('pair')
const steps = [1, 2, 3].map((n) => document.getElementById(`step-${n}`))

let connected = false
let busy = false

function show(kind, message) {
  state.className = `state is-${kind}`
  stateText.textContent = message
}

function markDone(upTo) {
  steps.forEach((li, i) => li.classList.toggle('is-done', i < upTo))
}

async function ask(path, method = 'GET') {
  const res = await fetch(`${ENDPOINT}${path}`, { method })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function connect() {
  if (busy || connected) return
  busy = true
  try {
    const { status, body } = await ask('/pair', 'POST')
    if (status === 200) {
      await chrome.storage.local.set({ token: body.token })
      connected = true
      markDone(3)
      show('done', 'Connected. Right-click any image and choose Save to Bowerbird.')
      pairButton.disabled = true
      pairButton.textContent = 'Connected'
    } else {
      show('ready', body.error || `Pairing refused (${status})`)
    }
  } catch {
    show('down', 'Bowerbird is not running.')
  } finally {
    busy = false
  }
}

// Polling turns a two-minute race into something the user can simply
// watch. The moment they click Pair in the app, this page connects on its
// own — the button is left in place for anyone who would rather press it.
async function poll() {
  if (connected) return
  try {
    const { status, body } = await ask('/status')
    if (status !== 200) return show('down', 'Bowerbird refused the connection.')
    if (body.pairing) {
      markDone(2)
      show('open', 'Pairing window is open — connecting…')
      await connect()
    } else {
      markDone(1)
      show('ready', 'Bowerbird is running. Click Pair extension in its Settings.')
    }
  } catch {
    markDone(0)
    show('down', 'Bowerbird is not running. Start the app.')
  }
}

pairButton.addEventListener('click', connect)

document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim()
  if (!token) return show('ready', 'Nothing to save.')
  await chrome.storage.local.set({ token })
  connected = true
  markDone(3)
  show('done', 'Token saved.')
})

chrome.storage.local.get('token').then(({ token }) => {
  if (token) {
    show('done', 'Already connected. Pair again to replace the token.')
    markDone(3)
  }
})

poll()
setInterval(poll, POLL_MS)
