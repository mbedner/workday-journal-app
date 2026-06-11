import { ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom'
}

export function Tooltip({ content, children, side = 'top' }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLElement>(null)

  const show = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos(
      side === 'top'
        ? { top: r.top + window.scrollY - 6, left: r.left + r.width / 2 }
        : { top: r.bottom + window.scrollY + 6, left: r.left + r.width / 2 }
    )
  }

  return (
    <span ref={ref as any} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="inline-flex min-w-0">
      {children}
      {pos && createPortal(
        <div
          style={{
            position: 'absolute',
            top:  pos.top,
            left: pos.left,
            transform: side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 9999,
          }}
          className="pointer-events-none px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap"
        >
          {content}
          {/* Arrow */}
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent ${
              side === 'top'
                ? 'top-full border-t-[5px] border-t-gray-900'
                : 'bottom-full border-b-[5px] border-b-gray-900'
            }`}
          />
        </div>,
        document.body
      )}
    </span>
  )
}
