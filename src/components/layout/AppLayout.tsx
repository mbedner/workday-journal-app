import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearch } from '../GlobalSearch'
import { ToastProvider } from '../../contexts/ToastContext'
import { ToastContainer } from '../ui/Toast'
import { pageVariants, pageTransition } from '../../lib/motion'

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()

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
        <Sidebar onOpenSearch={() => setSearchOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
            <div className="max-w-5xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={pageTransition}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
      <ToastContainer />
    </ToastProvider>
  )
}
