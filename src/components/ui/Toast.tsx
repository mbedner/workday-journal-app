import { useEffect, useState } from 'react'
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiCloseLine,
} from '@remixicon/react'
import { useToast, Toast, ToastType } from '../../contexts/ToastContext'

const config: Record<ToastType, { border: string; icon: React.ReactNode; text: string }> = {
  success: {
    border: 'border-l-green-500',
    icon: <RiCheckboxCircleLine size={18} className="text-green-500 shrink-0" />,
    text: 'text-green-700',
  },
  error: {
    border: 'border-l-red-500',
    icon: <RiErrorWarningLine size={18} className="text-red-500 shrink-0" />,
    text: 'text-red-700',
  },
  info: {
    border: 'border-l-indigo-500',
    icon: <RiInformationLine size={18} className="text-indigo-500 shrink-0" />,
    text: 'text-indigo-700',
  },
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger slide-in on mount
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const cfg = config[toast.type]

  return (
    <div
      className={`
        flex items-start gap-3 bg-white shadow-lg rounded-xl px-4 py-3
        border border-gray-100 border-l-4 ${cfg.border}
        min-w-[260px] max-w-sm
        transition-all duration-300 ease-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}
      `}
    >
      {cfg.icon}
      <p className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 text-gray-400 hover:text-gray-600 transition rounded shrink-0 ml-1"
        aria-label="Dismiss"
      >
        <RiCloseLine size={16} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts } = useToast()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  )
}
