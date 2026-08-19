import { forwardRef } from 'react'

const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

const SearchBar = forwardRef(function SearchBar(
  { s, count, total, onAddToSpace, selectionSize, hasSpace },
  ref
) {
  return (
    <>
      <div className="library-bar">
        <input
          ref={ref}
          className="search"
          value={s.query}
          placeholder="Search titles, tags, notes  ( / )"
          onChange={(e) => s.setQuery(e.target.value)}
        />

        <button
          className={`ghost ${s.favourite ? 'is-active' : ''}`}
          title="Favourites only"
          onClick={() => s.setFavourite(!s.favourite)}
        >
          ★
        </button>

        {s.facets.collections.length > 0 && (
          <select
            className="space-switch"
            value={s.collection || ''}
            onChange={(e) => s.setCollection(e.target.value || null)}
          >
            <option value="">All collections</option>
            {s.facets.collections.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {s.active && (
          <button className="ghost" onClick={s.clear}>
            Clear · {count}/{total}
          </button>
        )}

        {selectionSize > 0 && (
          <button className="primary small" disabled={!hasSpace} onClick={onAddToSpace}>
            Add {selectionSize} to space
          </button>
        )}
      </div>

      {s.facets.swatches.length > 0 && (
        <div className="swatches">
          {s.facets.swatches.map((c) => {
            const on = s.colour && s.colour.join() === c.join()
            return (
              <button
                key={c.join()}
                className={`swatch ${on ? 'is-active' : ''}`}
                style={{ background: rgb(c) }}
                title={`Colour ${rgb(c)}`}
                onClick={() => s.setColour(on ? null : c)}
              />
            )
          })}
        </div>
      )}
    </>
  )
})

export default SearchBar
