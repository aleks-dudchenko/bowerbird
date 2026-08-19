// Masonry через CSS columns: без бібліотек і без обрахунку позицій.
// Мінус — порядок читається згори вниз по колонці, а не зліва направо.
// Для бібліотеки референсів це прийнятно; якщо заважатиме, у M3 буде
// віртуалізована сітка з реальним розкладом.
export const srcOf = (p) => `zb://local/${encodeURIComponent(p)}`

export default function Grid({ items, selected, onSelect }) {
  return (
    <main className="grid">
      {items.map((item) => (
        <button
          key={item.id}
          className={`card ${selected?.id === item.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(item)}
          title={item.title}
        >
          <img
            src={srcOf(item.thumb)}
            alt={item.title}
            loading="lazy"
            // Тумбнейл міг не згенеруватися (svg, екзотичний формат) —
            // тоді показуємо оригінал.
            onError={(e) => {
              if (e.currentTarget.dataset.fallback) return
              e.currentTarget.dataset.fallback = '1'
              e.currentTarget.src = srcOf(item.path)
            }}
          />
        </button>
      ))}
    </main>
  )
}
