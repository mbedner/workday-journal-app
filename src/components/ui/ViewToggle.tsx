import { RiMenuLine, RiLayoutGridLine, RiCalendarLine } from '@remixicon/react'

export type ViewMode = 'list' | 'grid' | 'calendar'

interface ViewToggleProps {
  value: ViewMode
  onChange: (v: ViewMode) => void
  options?: ViewMode[]
}

const META: Record<ViewMode, { Icon: React.ElementType; label: string }> = {
  list:     { Icon: RiMenuLine,       label: 'List'     },
  grid:     { Icon: RiLayoutGridLine, label: 'Grid'     },
  calendar: { Icon: RiCalendarLine,   label: 'Calendar' },
}

export function ViewToggle({ value, onChange, options = ['list', 'grid', 'calendar'] }: ViewToggleProps) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
      {options.map(opt => {
        const { Icon, label } = META[opt]
        const active = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            title={label}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors
              ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-50'}
              ${opt !== options[0] ? 'border-l border-gray-200' : ''}
            `}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
