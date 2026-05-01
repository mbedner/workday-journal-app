import { useState, useRef, useEffect } from 'react'

interface Props {
  options: string[]
  selected: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
  allowCustom?: boolean
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select...', allowCustom = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  }

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase()) && !selected.includes(o)
  )

  const addCustom = () => {
    const val = query.trim()
    if (!val || selected.includes(val)) return
    onChange([...selected, val])
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips + input */}
      <div
        className="min-h-[36px] flex flex-wrap gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-transparent cursor-text transition"
        onClick={() => setOpen(true)}
      >
        {selected.map(v => (
          <span key={v} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-indigo-100 text-indigo-700">
            {v}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggle(v) }}
              className="text-indigo-400 hover:text-indigo-700 leading-none"
            >×</button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && allowCustom && query.trim()) { e.preventDefault(); addCustom() }
            if (e.key === 'Escape') { setOpen(false); setQuery('') }
          }}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent"
        />
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || (allowCustom && query.trim() && !options.includes(query.trim()))) && (
        <div className="dropdown-list absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-36 overflow-y-auto">
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => { e.preventDefault(); toggle(o) }}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
            >
              {o}
            </button>
          ))}
          {allowCustom && query.trim() && !options.includes(query.trim()) && !selected.includes(query.trim()) && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); addCustom() }}
              className="w-full text-left px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 transition border-t border-gray-100"
            >
              Add "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
