import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { supabase } from '../lib/supabase'
import { SearchResult } from '../types'
import { Badge } from './ui/Badge'

const typeVariants: Record<string, 'indigo' | 'green' | 'blue'> = {
  journal: 'indigo', task: 'green', transcript: 'blue',
}

interface Props {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [_allItems, setAllItems] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const fuseRef = useRef<Fuse<SearchResult> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadIndex = useCallback(async () => {
    if (loaded) return
    const [{ data: journals }, { data: tasks }, { data: transcripts }] = await Promise.all([
      supabase.from('journal_entries').select('id, entry_date, focus, accomplished, needs_attention, reflection'),
      supabase.from('tasks').select('id, title, notes, status, priority'),
      supabase.from('transcripts').select('id, meeting_title, meeting_date, summary, decisions, action_items'),
    ])

    const items: SearchResult[] = [
      ...(journals ?? []).map((j: any) => ({
        id: j.id, type: 'journal' as const,
        title: j.focus || `Journal — ${j.entry_date}`,
        date: j.entry_date,
        body: [j.focus, j.accomplished, j.needs_attention, j.reflection].filter(Boolean).join(' '),
        tags: [], projects: [],
        url: `/journal/${j.entry_date}`,
      })),
      ...(tasks ?? []).map((t: any) => ({
        id: t.id, type: 'task' as const,
        title: t.title,
        body: [t.title, t.notes, t.status].filter(Boolean).join(' '),
        tags: [], projects: [], status: t.status,
        url: '/tasks',
      })),
      ...(transcripts ?? []).map((t: any) => ({
        id: t.id, type: 'transcript' as const,
        title: t.meeting_title,
        date: t.meeting_date,
        body: [t.meeting_title, t.summary, t.decisions, t.action_items].filter(Boolean).join(' '),
        tags: [], projects: [],
        url: `/transcripts/${t.id}`,
      })),
    ]

    setAllItems(items)
    fuseRef.current = new Fuse(items, {
      keys: [{ name: 'title', weight: 2 }, { name: 'body', weight: 1 }],
      threshold: 0.4,
      includeScore: true,
    })
    setLoaded(true)
  }, [loaded])

  useEffect(() => {
    if (open) {
      loadIndex()
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
      setActiveIndex(0)
    }
  }, [open, loadIndex])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setActiveIndex(0); return }
    if (!fuseRef.current) return
    setResults(fuseRef.current.search(query).slice(0, 8).map(r => r.item))
    setActiveIndex(0)
  }, [query])

  const go = (url: string) => {
    navigate(url)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex].url)
    if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search journals, tasks, transcripts..."
            className="flex-1 text-sm outline-none placeholder-gray-400 text-gray-900"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 text-xs">
              Clear
            </button>
          )}
          <kbd className="hidden sm:inline text-xs text-gray-300 border border-gray-200 rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  onClick={() => go(r.url)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                    i === activeIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <Badge variant={typeVariants[r.type]} className="mt-0.5 shrink-0">{r.type}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                    {r.date && <p className="text-xs text-gray-400">{r.date}</p>}
                    {r.body && (
                      <p className="text-xs text-gray-500 truncate">{r.body.slice(0, 120)}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : query && loaded ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No matches for "{query}"</p>
        ) : query && !loaded ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center animate-pulse">Loading...</p>
        ) : (
          <div className="px-4 py-4 space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Quick nav</p>
            {[
              { label: "Today's journal", url: `/journal/${new Date().toISOString().slice(0, 10)}` },
              { label: 'Tasks', url: '/tasks' },
              { label: 'Transcripts', url: '/transcripts' },
            ].map(item => (
              <button
                key={item.url}
                onClick={() => go(item.url)}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-300">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
