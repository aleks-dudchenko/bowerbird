import { useEffect, useState } from 'react'

const api = window.bowerbird

// The token is the only thing standing between a web page and the
// library, so it is shown deliberately — revealed on request, never
// pre-filled into a visible field, and rotatable in one click.
export default function Settings({ onClose, root, items, theme }) {
  const [status, setStatus] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ai, setAi] = useState(null)
  const [helper, setHelper] = useState(null)
  const [extPath, setExtPath] = useState(null)
  const [pairing, setPairing] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    api.serverStatus().then(setStatus)
    api.helperStatus().then(setHelper)
    return api.onEvent((e) => e.type === 'ai:progress' && setAi(e))
  }, [])

  const busy = ai && ai.done !== ai.total

  // A visible countdown, because a window the user cannot see the end of
  // is one they will miss.
  useEffect(() => {
    if (pairing <= 0) return
    const t = setInterval(() => setPairing((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(t)
  }, [pairing])

  async function pair() {
    const { seconds } = await api.openPairing()
    setPairing(seconds)
  }

  async function rotate() {
    const { token } = await api.rotateToken()
    setStatus((s) => ({ ...s, token }))
    setRevealed(true)
  }

  function copy() {
    navigator.clipboard.writeText(status.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="sheet" onMouseDown={onClose}>
      <div className="sheet-body" onMouseDown={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <strong>Appearance</strong>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <p className="muted">
          Colour reads differently against light and dark, so judging a
          reference for print on a near-black background will mislead you.
        </p>

        <div className="modes wide">
          {[
            ['system', 'System'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={theme?.source === value ? 'is-active' : ''}
              onClick={() => theme?.choose(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <hr className="rule" />

        <div className="detail-head">
          <strong>Browser extension</strong>
        </div>

        <p className="muted">
          Bowerbird listens on <code>127.0.0.1</code> only while the app is
          open. Works in any Chromium browser — Comet, Chrome, Brave, Edge,
          Arc. Load the folder below as an unpacked extension, open its
          options, then click Pair here: the page connects by itself.
        </p>

        <div className="button-row">
          <button className="primary small" onClick={pair}>
            {pairing > 0 ? `Waiting for the extension · ${pairing}s` : 'Pair extension'}
          </button>
          <button
            className="ghost"
            onClick={async () => setExtPath((await api.revealExtension()).path)}
          >
            Show the extension folder
          </button>
        </div>
        {extPath && <div className="ai-progress mono-path">{extPath}</div>}

        <details className="token-details">
          <summary>Connection token</summary>
          <p className="muted">
            Only needed if pairing cannot reach the app.
          </p>
          <div className="token-row">
            <input readOnly value={revealed ? status?.token ?? '' : '••••••••••••••••••••'} />
            <button className="ghost" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button className="ghost" onClick={copy} disabled={!status}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </details>

        <dl className="meta">
          <dt>Status</dt>
          <dd className={status && !status.running ? 'is-error-text' : ''}>
            {status?.running
              ? `listening on port ${status.port}`
              : status?.error || 'not listening'}
          </dd>
        </dl>

        <p className="muted">
          Rotating the token immediately stops the old one working. You will
          need to paste the new one into the extension.
        </p>
        <button className="danger" onClick={rotate}>Rotate token</button>

        <hr className="rule" />

        <div className="detail-head"><strong>Local AI</strong></div>
        <p className="muted">
          Everything below runs on this machine. The image model is about
          150&nbsp;MB and downloads the first time you use it; nothing is sent
          anywhere, and there is no API key.
        </p>

        {helper && !helper.found && (
          <div className="ai-progress is-error">
            The system helper is missing, so video, OCR, PDF and HEIC will not
            work. Build it with <code>make -C helper</code>.
          </div>
        )}

        {result && <div className="ai-progress">{result}</div>}

        {ai && (
          <div className="ai-progress">
            {ai.phase === 'model'
              ? `Downloading model… ${Math.round(ai.progress || 0)}%`
              : `${ai.phase}: ${ai.done} / ${ai.total}`}
          </div>
        )}

        <div className="button-row">
          <button
            className="primary small"
            disabled={busy}
            onClick={() => api.indexForAi(root)}
          >
            Index for search by description
          </button>
          <button
            className="ghost"
            disabled={busy || !items?.length}
            onClick={() => api.autoTag(root, items)}
          >
            Suggest tags
          </button>
          <button
            className="ghost"
            disabled={busy || !items?.length}
            onClick={async () => {
              const targets = items.filter((i) => i.kind === 'image' && !i.ocr)
              if (!targets.length) return setResult('Every image has already been read.')
              const r = await api.runOcr(targets)
              setResult(
                r.failed
                  ? `Failed on ${r.failed} of ${r.done}: ${r.error}`
                  : `Read ${r.done} image${r.done === 1 ? '' : 's'}.`
              )
            }}
          >
            Read text in images
          </button>
          {busy && <button className="ghost" onClick={() => api.cancelAi()}>Cancel</button>}
        </div>
      </div>
    </div>
  )
}
