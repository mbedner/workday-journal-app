import { useState, useRef, useEffect } from 'react'
import { RiCloseLine } from '@remixicon/react'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  /** If true, any typed value is accepted (not just options). Defaults to false. */
  allowCustom?: boolean
}

export function Combobox({ value, onChange, options, placeholder = 'Search…', allowCustom = false }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value)

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // If allowCustom and there's a typed query not yet committed, commit it
        if (allowCustom && query.trim() && query !== value) {
          onChange(query.trim())
        }
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [query, value, allowCustom, onChange])

  const select = (opt: ComboboxOption) => {
    onChange(opt.value)
    setQuery('')
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    if (allowCustom) onChange(e.target.value)
    setOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); select(filtered[0]) }
    if (e.key === 'Enter' && allowCustom && query.trim()) { e.preventDefault(); onChange(query.trim()); setOpen(false); setQuery('') }
  }

  const displayValue = open ? query : (selectedOption?.label ?? (allowCustom ? value : ''))

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-base sm:text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            aria-label="Clear"
          >
            <RiCloseLine size={15} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(opt) }}
              className={`w-full text-left px-3 py-2 text-sm flex items-baseline gap-2 hover:bg-indigo-50 transition-colors ${opt.value === value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-800'}`}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.sublabel && <span className="text-xs text-gray-400 truncate">{opt.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
