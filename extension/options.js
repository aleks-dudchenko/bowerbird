const field = document.getElementById('token')
const status = document.getElementById('status')

chrome.storage.local.get('token').then(({ token }) => {
  if (token) field.value = token
})

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ token: field.value.trim() })
  status.textContent = 'Saved'
  setTimeout(() => { status.textContent = '' }, 2000)
})
