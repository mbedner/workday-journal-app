import { NavLink } from 'react-router-dom'
import {
  RiDashboardLine,
  RiBookOpenLine,
  RiCheckboxLine,
  RiFileList3Line,
  RiFolderLine,
  RiSettings3Line,
  RiSearchLine,
  RiArchiveLine,
  RiSparklingLine,
} from '@remixicon/react'

const nav = [
  { to: '/dashboard', label: 'Dashboard', Icon: RiDashboardLine },
  { to: '/journal', label: 'Journal', Icon: RiBookOpenLine },
  { to: '/tasks', label: 'Tasks', Icon: RiCheckboxLine },
  { to: '/transcripts', label: 'Meeting Notes', Icon: RiFileList3Line },
  { to: '/projects', label: 'Projects', Icon: RiFolderLine },
]

const bottomNav = [
  { to: '/archive', label: 'Archive', Icon: RiArchiveLine },
  { to: '/settings', label: 'Settings', Icon: RiSettings3Line },
]

interface Props {
  onOpenSearch: () => void
  onOpenAsk: () => void
}

export function Sidebar({ onOpenSearch, onOpenAsk }: Props) {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-200 h-full">
      <div className="px-5 py-5 border-b border-gray-100">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">Workday Journal</h1>
        <p className="text-xs text-gray-400 mt-0.5">Your daily work companion</p>
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200 hover:border-indigo-300 hover:text-gray-600 transition-colors group"
        >
          <RiSearchLine size={14} className="shrink-0" />
          <span className="flex-1 text-left text-xs">Search...</span>
          <kbd className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-300 group-hover:text-gray-400 transition-colors">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {nav.map(({ to, label, Icon }) => (
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
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Ask Your Data */}
      <div className="px-3 pb-3">
        <button
          onClick={onOpenAsk}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <RiSparklingLine size={16} className="text-indigo-500 shrink-0" />
          Ask Your Data
        </button>
      </div>

      {/* Bottom nav */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3 space-y-0.5">
        {bottomNav.map(({ to, label, Icon }) => (
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
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
