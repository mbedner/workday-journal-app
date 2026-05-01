import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RiCloseLine, RiEqualizerLine } from '@remixicon/react'

// ── Bottom-sheet for mobile filter/sort controls ──────────────────────────────

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  activeCount?: number
}

export function FilterSheet({ open, onClose, children, activeCount = 0 }: FilterSheetProps) {
  // Lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else       document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape key closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl sm:hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <RiEqualizerLine size={15} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Filter &amp; Sort</h3>
                {activeCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {activeCount}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <RiCloseLine size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {children}
            </div>

            {/* Footer — done button */}
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Trigger button shown in the page header on mobile ─────────────────────────

interface FilterTriggerProps {
  onClick: () => void
  activeCount?: number
}

export function FilterTrigger({ onClick, activeCount = 0 }: FilterTriggerProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors shrink-0 sm:hidden self-stretch"
    >
      <RiEqualizerLine size={14} />
      <span>Filter</span>
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
          {activeCount}
        </span>
      )}
    </button>
  )
}

// ── Labelled wrapper for a filter row inside the sheet ───────────────────────

export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  )
}
