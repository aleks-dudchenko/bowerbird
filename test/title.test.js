import { test } from 'node:test'
import assert from 'node:assert/strict'

// Mirrors titleFor in src/main/server.js. Extracted here because the
// module pulls in electron, which cannot load under plain node.
function titleFor(url, pageUrl) {
  try {
    if (!url.startsWith('data:')) {
      const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
      const stem = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      if (stem && !/^\d+$/.test(stem)) return stem.slice(0, 120)
    }
    if (pageUrl) {
      const u = new URL(pageUrl)
      const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
      const stem = last.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      return (stem ? `${stem} — ${u.hostname}` : u.hostname).slice(0, 120)
    }
  } catch {
    /* unparseable */
  }
  return 'Saved from the web'
}

test('the image filename becomes the title', () => {
  assert.equal(titleFor('https://site.com/img/brutalist-poster.png'), 'brutalist poster')
})

test('underscores and dashes become spaces', () => {
  assert.equal(titleFor('https://site.com/a/swiss_grid_layout.jpg'), 'swiss grid layout')
})

test('a purely numeric filename is not a useful title', () => {
  // Saves used to be named after the temp file, e.g. bowerbird-1787217222181.
  assert.equal(titleFor('https://picsum.photos/id/1015/800/600', 'https://picsum.photos/images'),
    'images — picsum.photos')
})

test('a data URL falls back to the page', () => {
  assert.equal(titleFor('data:image/png;base64,AAAA', 'https://blog.example.com/posts/typography'),
    'typography — blog.example.com')
})

test('a page with no path gives the hostname', () => {
  assert.equal(titleFor('data:image/png;base64,AAAA', 'https://dribbble.com/'), 'dribbble.com')
})

test('percent-encoding is decoded', () => {
  assert.equal(titleFor('https://site.com/%D1%88%D1%80%D0%B8%D1%84%D1%82.png'), 'шрифт')
})

test('no usable source at all still yields something readable', () => {
  assert.equal(titleFor('data:image/png;base64,AAAA'), 'Saved from the web')
  assert.equal(titleFor('not a url'), 'Saved from the web')
})

test('absurdly long names are trimmed', () => {
  assert.ok(titleFor(`https://s.com/${'a'.repeat(400)}.png`).length <= 120)
})
