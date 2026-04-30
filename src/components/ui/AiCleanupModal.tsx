import { useEffect, useState } from 'react'
import { RiSparklingLine } from '@remixicon/react'
import { Modal } from './Modal'
import { Button } from './Button'
import { MarkdownContent } from './MarkdownContent'
import { cleanUpWriting } from '../../lib/ai'

interface Props {
  open: boolean
  onClose: () => void
  original: string
  onReplace: (improved: string) => void
  mode?: 'journal' | 'meeting'
}

export function AiCleanupModal({ open, onClose, original, onReplace, mode }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !original.trim()) return
    setResult(null)
    setError(null)
    setCopied(false)
    setLoading(true)
    cleanUpWriting(original, mode)
      .then(r => setResult(r.cleaned_text))
      .catch(e => setError(e.message ?? 'AI assist unavailable. Try again.'))
      .finally(() => setLoading(false))
  }, [open, original])

  const handleCopy = async () => {
    const plain = (result ?? '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    await navigator.clipboard.writeText(plain).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReplace = () => {
    if (result) { onReplace(result); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Clean up writing" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Original */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Original</p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 min-h-[140px] max-h-64 overflow-y-auto">
              <MarkdownContent content={original} />
            </div>
          </div>

          {/* Improved */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <RiSparklingLine size={13} className="text-indigo-500" />
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Improved</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-3 text-sm text-gray-700 min-h-[140px] max-h-64 overflow-y-auto">
              {loading && (
                <div className="flex items-center gap-2 text-gray-400 animate-pulse pt-2">
                  <RiSparklingLine size={14} className="text-indigo-400" />
                  <span className="text-xs">Thinking…</span>
                </div>
              )}
              {error && <p className="text-red-500 text-xs">{error}</p>}
              {result && <MarkdownContent content={result} />}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {result && (
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          )}
          <Button onClick={handleReplace} disabled={!result || loading}>
            Replace
          </Button>
        </div>
      </div>
    </Modal>
  )
}
