import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { RiSparklingLine } from '@remixicon/react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearch } from '../GlobalSearch'
import { AskDataDrawer } from '../ui/AskDataDrawer'
import { ToastProvider } from '../../contexts/ToastContext'
import { ToastContainer } from '../ui/Toast'

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar onOpenSearch={() => setSearchOpen(true)} onOpenAsk={() => setAskOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar onOpenSearch={() => setSearchOpen(true)} onOpenAsk={() => setAskOpen(true)} />
          <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
            <div className="max-w-5xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <AskDataDrawer open={askOpen} onClose={() => setAskOpen(false)} />
      </div>

      {/* Floating Ask button — visible only on desktop when sidebar is hidden, tucked to bottom-right */}
      <button
        onClick={() => setAskOpen(true)}
        className="hidden fixed bottom-5 right-5 z-40 items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-medium shadow-lg hover:bg-indigo-700 transition-colors"
        aria-label="Ask Your Data"
      >
        <RiSparklingLine size={15} />
        Ask Your Data
      </button>

      <ToastContainer />
    </ToastProvider>
  )
}
