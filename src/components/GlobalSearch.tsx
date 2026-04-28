import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { AnimatePresence, motion } from 'framer-motion'
import {
  RiSearchLine, RiCloseLine, RiArrowRightSLine,
  RiBookOpenLine, RiCheckboxLine, RiFileList3Line,
} from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { SearchResult } from '../types'
import { Badge } from './ui/Badge'

const typeVariants: Record<string, 'indigo' | 'green' | 'blue'> = {
  journal: 'indigo', task: 'green', transcript: 'blue',
}

const typeLabels: Record<string, string> = {
  journal: 'Journal', task: 'Task', transcript: 'Meeting',
}

interface Props {
  open: boolean
  onClose: () => void
}

/** Strip HTML tags and markdown syntax to get plain indexable text */
function toPlainText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Return a ~150-char excerpt around the first occurrence of `query` in `text` */
function excerpt(text: string, query: string, len = 150): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase().split(' ')[0])
  if (idx === -1) return text.slice(0, len) + (text.length > len ? '…' : '')
  const pad = Math.floor((len - query.length) / 2)
  const start = Math.max(0, idx - pad)
  const end = Math.min(text.length, start + len)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export function GlobalSearch({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const fuseRef = useRef<Fuse<SearchResult> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadIndex = useCallback(async () => {
    if (loaded) return
    setLoading(true)

    const [{ data: journals }, { data: tasks }, { data: transcripts }] = await Promise.all([
      supabase.from('journal_entries').select(
        'id, entry_date, focus, accomplished, needs_attention, reflection'
      ).is('archived_at', null),
      supabase.from('tasks').select('id, title, notes, status, priority').is('archived_at', null),
      supabase.from('transcripts').select(
        'id, meeting_title, meeting_date, attendees, raw_transcript, summary, decisions, action_items'
      ).is('archived_at', null),
    ])

    const items: SearchResult[] = [
      ...(journals ?? []).map((j: any) => {
        const plain = [j.focus, j.accomplished, j.needs_attention, j.reflection]
          .map(toPlainText).filter(Boolean).join(' ')
        return {
          id: j.id,
          type: 'journal' as const,
          title: toPlainText(j.focus) || `Journal — ${j.entry_date}`,
          date: j.entry_date,
          body: plain,
          tags: [], projects: [],
          url: `/journal/${j.entry_date}`,
        }
      }),
      ...(tasks ?? []).map((t: any) => ({
        id: t.id,
        type: 'task' as const,
        title: t.title,
        body: [t.title, toPlainText(t.notes)].filter(Boolean).join(' '),
        tags: [], projects: [], status: t.status,
        url: '/tasks',
      })),
      ...(transcripts ?? []).map((t: any) => {
        const plain = [
          t.meeting_title, t.attendees,
          t.raw_transcript, t.summary, t.decisions, t.action_items,
        ].map(toPlainText).filter(Boolean).join(' ')
        return {
          id: t.id,
          type: 'transcript' as const,
          title: t.meeting_title,
          date: t.meeting_date,
          body: plain,
          tags: [], projects: [],
          url: `/transcripts/${t.id}`,
        }
      }),
    ]

    fuseRef.current = new Fuse(items, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'body', weight: 1 },
      ],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    })

    setLoaded(true)
    setLoading(false)
  }, [loaded])

  useEffect(() => {
    if (open) {
      loadIndex()
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
      setActiveIndex(0)
      setLoaded(false)
      fuseRef.current = null
    }
  }, [open, loadIndex])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setActiveIndex(0); return }
    if (!fuseRef.current) return

    const q = query.toLowerCase().trim()

    const allItems: SearchResult[] = (fuseRef.current as any)._docs ?? []
    const exactIds = new Set<string>()
    const exactMatches = allItems.filter(item => {
      const hit =
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q)
      if (hit) exactIds.add(`${item.type}-${item.id}`)
      return hit
    })

    const fuzzyMatches = fuseRef.current
      .search(query)
      .map(r => r.item)
      .filter(item => !exactIds.has(`${item.type}-${item.id}`))

    setResults([...exactMatches, ...fuzzyMatches].slice(0, 10))
    setActiveIndex(0)
  }, [query])

  const go = (url: string) => { navigate(url); onClose() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex].url)
    if (e.key === 'Escape') onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <RiSearchLine size={16} className="text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search across journals, tasks, and meeting notes…"
                className="flex-1 text-sm outline-none placeholder-gray-400 text-gray-900"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 transition p-0.5 rounded">
                  <RiCloseLine size={16} />
                </button>
              )}
              <kbd className="hidden sm:inline text-xs text-gray-300 border border-gray-200 rounded px-1.5 py-0.5 font-mono">esc</kbd>
            </div>

            {/* Results */}
            {results.length > 0 ? (
              <ul className="max-h-[420px] overflow-y-auto py-2">
                <AnimatePresence initial={false}>
                  {results.map((r, i) => (
                    <motion.li
                      key={`${r.type}-${r.id}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                      <button
                        onClick={() => go(r.url)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                          i === activeIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <Badge variant={typeVariants[r.type]} className="mt-0.5 shrink-0 text-xs">
                          {typeLabels[r.type]}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                          {r.date && <p className="text-xs text-gray-400">{r.date}</p>}
                          {r.body && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {excerpt(r.body, query)}
                            </p>
                          )}
                        </div>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : loading ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center animate-pulse">Loading index…</p>
            ) : query ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No matches for "<span className="text-gray-600 font-medium">{query}</span>"</p>
            ) : (
              <div className="px-4 py-4 space-y-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Quick nav</p>
                {[
                  { label: "Today's journal", url: `/journal/${new Date().toISOString().slice(0, 10)}`, Icon: RiBookOpenLine },
                  { label: 'Tasks', url: '/tasks', Icon: RiCheckboxLine },
                  { label: 'Meeting Notes', url: '/transcripts', Icon: RiFileList3Line },
                ].map(({ label, url, Icon }) => (
                  <button
                    key={url}
                    onClick={() => go(url)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2.5"
                  >
                    <Icon size={15} className="text-gray-400 shrink-0" />
                    {label}
                    <RiArrowRightSLine size={15} className="text-gray-300 ml-auto" />
                  </button>
                ))}
              </div>
            )}

            <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-300">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">esc</kbd> close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
