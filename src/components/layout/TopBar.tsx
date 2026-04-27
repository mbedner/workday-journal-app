import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { RiMenuLine, RiCloseLine, RiSearchLine } from '@remixicon/react'
import { useAuth } from '../../hooks/useAuth'

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/journal', label: 'Journal' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/transcripts', label: 'Transcripts' },
  { to: '/projects', label: 'Projects' },
  { to: '/settings', label: 'Settings' },
]

interface Props {
  onOpenSearch: () => void
}

export function TopBar({ onOpenSearch }: Props) {
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <h1 className="text-base font-bold text-gray-900 shrink-0">Workday Journal</h1>
        <button
          onClick={onOpenSearch}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200 hover:border-indigo-300 transition-colors"
        >
          <RiSearchLine size={14} className="shrink-0" />
          <span className="text-xs">Search...</span>
        </button>
        <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-600 shrink-0">
          {open ? <RiCloseLine size={20} /> : <RiMenuLine size={20} />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-gray-100 px-3 py-2 space-y-0.5">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <button
            onClick={handleSignOut}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 font-medium"
          >
            Sign out
          </button>
        </nav>
      )}
    </header>
  )
}
