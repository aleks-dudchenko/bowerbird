// One grid, one stroke weight, no fills. Icons here have to survive at
// 16px next to 12px text, so anything that needs a third stroke to be
// legible has been left as a word instead.
const PATHS = {
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  folder: [
    'M3.2 8.4a2 2 0 0 1 2-2h3.3a2 2 0 0 1 1.4.6l1.2 1.2h7.7a2 2 0 0 1 2 2v7.4a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2Z',
  ],
  gear: [
    'M10.6 5.1L10.7 2.7L13.3 2.7L13.4 5.1L16.5 6.6L18.4 5.2L20.1 7.2L18.2 8.8L19.0 12.2L21.4 12.8L20.8 15.4L18.4 14.9L16.2 17.6L17.2 19.8L14.8 21.0L13.7 18.8L10.3 18.8L9.2 21.0L6.8 19.8L7.8 17.6L5.6 14.9L3.2 15.4L2.6 12.8L5.0 12.2L5.8 8.8L3.9 7.2L5.6 5.2L7.5 6.6Z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  trash: [
    'M4.5 7h15',
    'M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7',
    'M6.5 7l.9 12a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12',
  ],
  reveal: ['M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5', 'M20 4l-9 9', 'M14 4h6v6'],
  star: ['M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8Z'],
  chevronDown: ['M6.5 9.5l5.5 5.5 5.5-5.5'],
  chevronUp: ['M6.5 14.5l5.5-5.5 5.5 5.5'],
  back: ['M19 12H5.5', 'M11 5.5L4.5 12l6.5 6.5'],
  sparkle: [
    'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7Z',
    'M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z',
  ],
  restore: ['M4.5 10.5A7.5 7.5 0 1 1 5 15.5', 'M4 5v5.5h5.5'],
}

export default function Icon({ name, size = 16, filled = false }) {
  const paths = PATHS[name]
  if (!paths) return null
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

/**
 * An icon that is also a button. `tip` is not decoration: an icon with
 * no hover text is a guessing game, so the prop is required in practice
 * and the accessible name comes from the same string.
 */
export function IconButton({ icon, tip, align, filled, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      data-tip={tip}
      data-tip-align={align}
      aria-label={tip}
      {...rest}
    >
      <Icon name={icon} filled={filled} />
    </button>
  )
}
