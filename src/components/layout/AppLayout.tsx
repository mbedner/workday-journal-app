import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
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
      {/* Push-drawer layout: sidebar | content | ask-drawer all in one flex row */}
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar onOpenSearch={() => setSearchOpen(true)} onOpenAsk={() => setAskOpen(prev => !prev)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar onOpenSearch={() => setSearchOpen(true)} onOpenAsk={() => setAskOpen(prev => !prev)} />
          <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8" style={{ scrollbarGutter: 'stable' }}>
            <div className="max-w-5xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
        {/* Drawer sits as a flex sibling — pushes content left as it opens */}
        <AskDataDrawer open={askOpen} onClose={() => setAskOpen(false)} />
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ToastContainer />
    </ToastProvider>
  )
}
