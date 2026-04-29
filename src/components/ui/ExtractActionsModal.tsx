import { useEffect, useState } from 'react'
import { RiSparklingLine, RiAddLine, RiDeleteBinLine } from '@remixicon/react'
import { Modal } from './Modal'
import { Button } from './Button'
import { extractTranscriptActions, ExtractedActions } from '../../lib/ai'

interface Props {
  open: boolean
  onClose: () => void
  transcript: string
  onAddTasks: (titles: string[]) => Promise<void>
}

type Section = keyof ExtractedActions

const SECTIONS: { key: Section; label: string; color: string }[] = [
  { key: 'action_items', label: 'Action Items', color: 'indigo' },
  { key: 'decisions',    label: 'Decisions',    color: 'green'  },
  { key: 'follow_ups',   label: 'Follow-ups',   color: 'yellow' },
]

const colorClasses = {
  indigo: { dot: 'bg-indigo-500', badge: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  green:  { dot: 'bg-green-500',  badge: 'text-green-700  bg-green-50  border-green-200'  },
  yellow: { dot: 'bg-yellow-500', badge: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
}

export function ExtractActionsModal({ open, onClose, transcript, onAddTasks }: Props) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ExtractedActions | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding]     = useState(false)

  useEffect(() => {
    if (!open || !transcript.trim()) return
    setResult(null)
    setError(null)
    setSelected(new Set())
    setLoading(true)
    extractTranscriptActions(transcript)
      .then(r => setResult(r))
      .catch(e => setError(e.message ?? 'AI assist unavailable. Try again.'))
      .finally(() => setLoading(false))
  }, [open, transcript])

  const toggleItem = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleAddTasks = async () => {
    if (!result) return
    const titles: string[] = []
    SECTIONS.forEach(({ key }) => {
      result[key].forEach((item, i) => {
        if (selected.has(`${key}-${i}`)) titles.push(item)
      })
    })
    if (!titles.length) return
    setAdding(true)
    await onAddTasks(titles)
    setAdding(false)
    onClose()
  }

  const totalItems = result ? Object.values(result).reduce((s, arr) => s + arr.length, 0) : 0
  const hasContent = totalItems > 0

  return (
    <Modal open={open} onClose={onClose} title="Extract action items" size="lg">
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 animate-pulse">
            <RiSparklingLine size={16} className="text-indigo-400" />
            <span className="text-sm">Analyzing your meeting notes…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {result && !hasContent && (
          <p className="text-sm text-gray-400 text-center py-6">No action items, decisions, or follow-ups found in these notes.</p>
        )}

        {result && hasContent && (
          <>
            <p className="text-xs text-gray-400">Select items to add as tasks. Unselected items are still visible for reference.</p>
            <div className="space-y-4">
              {SECTIONS.map(({ key, label, color }) => {
                const items = result[key]
                if (!items.length) return null
                const { dot, badge } = colorClasses[color as keyof typeof colorClasses]
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</p>
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => {
                        const id = `${key}-${i}`
                        const isSelected = selected.has(id)
                        return (
                          <li
                            key={id}
                            onClick={() => toggleItem(id)}
                            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? `${badge} border`
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-current border-current text-white' : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                  <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                            {item}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {selected.size > 0 && (
              <>
                <RiAddLine size={13} />
                <span>{selected.size} item{selected.size !== 1 ? 's' : ''} selected</span>
                <button onClick={() => setSelected(new Set())} className="ml-1 text-gray-300 hover:text-gray-500 transition">
                  <RiDeleteBinLine size={12} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {result && hasContent && (
              <Button
                onClick={handleAddTasks}
                loading={adding}
                disabled={selected.size === 0}
              >
                Add {selected.size > 0 ? selected.size : ''} task{selected.size !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
