import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/journal', label: 'Journal', icon: '✎' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/transcripts', label: 'Transcripts', icon: '◎' },
  { to: '/projects', label: 'Projects', icon: '◈' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

interface Props {
  onOpenSearch: () => void
}

export function Sidebar({ onOpenSearch }: Props) {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-200 h-full">
      <div className="px-5 py-5 border-b border-gray-100">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">Workday Journal</h1>
        <p className="text-xs text-gray-400 mt-0.5">Your daily work companion</p>
      </div>

      {/* Search trigger */}
      <div className="px-3 pt-3">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200 hover:border-indigo-300 hover:text-gray-600 transition-colors group"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <span className="flex-1 text-left text-xs">Search...</span>
          <kbd className="text-xs font-mono bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-300 group-hover:text-gray-400 transition-colors">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base w-5 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
