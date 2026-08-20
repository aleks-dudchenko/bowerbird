// Runs in the page's own JavaScript world — the only place X's API
// responses are visible, because a content script in the isolated world
// sees the DOM but not the traffic that built it.
//
// It reads those responses and forwards nothing but media descriptions
// to the isolated script next door: no cookies, no auth headers, no
// request bodies. Everything else about the response is dropped.
;(() => {
  const seen = new Set()

  const describe = (m) => ({
    type: m.type ?? (m.video_info ? 'video' : 'photo'),
    image: m.media_url_https ?? null,
    variants: m.video_info?.variants ?? [],
  })

  // X nests a tweet several layers down and spells the container
  // differently depending on the endpoint, so this looks for the shape
  // rather than a path: an object with an id and a media list on it.
  function harvest(node, out, depth) {
    if (!node || typeof node !== 'object' || depth > 14) return out
    if (Array.isArray(node)) {
      for (const child of node) harvest(child, out, depth + 1)
      return out
    }
    const media = (node.extended_entities ?? node.entities)?.media
    if (node.id_str && Array.isArray(media) && media.length) {
      out.push([String(node.id_str), media.map(describe)])
    }
    for (const value of Object.values(node)) harvest(value, out, depth + 1)
    return out
  }

  function offer(json) {
    let entries
    try {
      entries = harvest(json, [], 0)
    } catch {
      return
    }
    const fresh = entries.filter(([id, list]) => {
      const key = `${id}:${list.length}`
      if (seen.has(key)) return false
      // A long session would otherwise remember every post ever scrolled.
      if (seen.size > 800) seen.clear()
      seen.add(key)
      return true
    })
    if (fresh.length) {
      window.postMessage({ __bowerbird: 'x-media', entries: fresh }, location.origin)
    }
  }

  const interesting = (url) => typeof url === 'string' && url.includes('/i/api/')

  const nativeFetch = window.fetch
  window.fetch = function (input, init) {
    const pending = nativeFetch.apply(this, arguments)
    try {
      const url = typeof input === 'string' ? input : input?.url
      if (interesting(url)) {
        // Cloning has to happen before the app reads the body. This
        // handler was attached first, so it runs first.
        pending
          .then((res) => res.clone().json().then(offer))
          .catch(() => {})
      }
    } catch {
      /* instrumentation must never be the reason a page breaks */
    }
    return pending
  }

  const nativeOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    if (interesting(url)) {
      this.addEventListener('load', () => {
        try {
          offer(JSON.parse(this.responseText))
        } catch {
          /* not JSON, or not ours */
        }
      })
    }
    return nativeOpen.apply(this, arguments)
  }
})()
