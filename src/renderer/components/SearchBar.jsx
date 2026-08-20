import { forwardRef } from 'react'
import { IconButton } from './Icon.jsx'

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
          placeholder={s.semantic ? 'Describe what you remember  ( / )' : 'Search titles, tags, notes  ( / )'}
          onChange={(e) => s.setQuery(e.target.value)}
        />

        <button
          className={`ghost ${s.semantic ? 'is-active' : ''}`}
          data-tip="Describe an image instead of matching its words"
          data-tip-align="right"
          onClick={() => s.setSemantic(!s.semantic)}
        >
          {s.thinking ? '…' : 'AI'}
        </button>

        <IconButton
          icon="star"
          tip="Favourites only"
          filled={s.favourite}
          className={s.favourite ? 'is-active' : ''}
          onClick={() => s.setFavourite(!s.favourite)}
        />

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
          <button className="ghost" data-tip="Clear every filter" onClick={s.clear}>
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
                data-tip={`Colour ${rgb(c)}`}
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
