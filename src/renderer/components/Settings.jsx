import { useEffect, useState } from 'react'

const api = window.zbirka

// The token is the only thing standing between a web page and the
// library, so it is shown deliberately — revealed on request, never
// pre-filled into a visible field, and rotatable in one click.
export default function Settings({ onClose }) {
  const [status, setStatus] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.serverStatus().then(setStatus)
  }, [])

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
          <strong>Browser extension</strong>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <p className="muted">
          Zbirka listens on <code>127.0.0.1</code> only while the app is open.
          Load the <code>extension/</code> folder in Chrome as an unpacked
          extension, open its options, and paste this token.
        </p>

        <div className="field">
          <span>Connection token</span>
          <div className="token-row">
            <input readOnly value={revealed ? status?.token ?? '' : '••••••••••••••••••••'} />
            <button className="ghost" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button className="ghost" onClick={copy} disabled={!status}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <dl className="meta">
          <dt>Status</dt>
          <dd>{status?.running ? `listening on port ${status.port}` : 'not listening'}</dd>
        </dl>

        <p className="muted">
          Rotating the token immediately stops the old one working. You will
          need to paste the new one into the extension.
        </p>
        <button className="danger" onClick={rotate}>Rotate token</button>
      </div>
    </div>
  )
}
