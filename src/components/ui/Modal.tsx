import { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RiCloseLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className={`relative bg-white rounded-2xl shadow-xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {title && (
              <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition p-0.5 rounded-lg hover:bg-gray-100"
                >
                  <RiCloseLine size={18} />
                </button>
              </div>
            )}
            <div className="p-6 overflow-y-auto flex-1">{children}</div>
            {footer && (
              <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
