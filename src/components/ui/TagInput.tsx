import { useState, KeyboardEvent } from 'react'
import { RiCloseLine } from '@remixicon/react'
import { Badge } from './Badge'

interface Props {
  label?: string
  values: string[]
  suggestions?: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

export function TagInput({ label, values, suggestions = [], onChange, placeholder = 'Add tag...' }: Props) {
  const [input, setInput] = useState('')

  const add = (val: string) => {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput('')
  }

  const remove = (val: string) => onChange(values.filter(v => v !== val))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      remove(values[values.length - 1])
    }
  }

  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s))

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <div className="rounded-lg border border-gray-300 px-3 py-2 flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition">
        {values.map(v => (
          <Badge key={v} variant="indigo" className="flex items-center gap-1">
            {v}
            <button type="button" onClick={() => remove(v)} className="ml-0.5 hover:text-indigo-900">
              <RiCloseLine size={12} />
            </button>
          </Badge>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (input.trim()) add(input) }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] text-base sm:text-sm outline-none bg-transparent"
        />
      </div>
      {filtered.length > 0 && (
        <div className="border border-gray-200 rounded-lg shadow-sm bg-white z-10 max-h-40 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              // onMouseDown prevents the input's onBlur from firing before this click registers
              onMouseDown={e => { e.preventDefault(); add(s) }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
