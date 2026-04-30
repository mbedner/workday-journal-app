import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  RiCloseLine, RiSparklingLine, RiSendPlane2Line,
  RiDeleteBinLine, RiBookOpenLine, RiCheckboxLine, RiFileList3Line,
  RiArrowRightSLine, type RemixiconComponentType,
} from '@remixicon/react'
import Fuse from 'fuse.js'
import {
  format, subDays, subWeeks, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from 'date-fns'
import { supabase } from '../../lib/supabase'
import { askData, SearchableRecord, AskDataSource } from '../../lib/ai'
import { Badge } from './Badge'
import { MarkdownContent } from './MarkdownContent'

interface Props {
  open: boolean
  onClose: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: AskDataSource[]
  /** Typewriter animation state — present only while streaming */
  displayLength?: number
  isStreaming?: boolean
}

const SUGGESTED_PROMPTS = [
  'What did I accomplish this week?',
  'What needs follow-up from recent meetings?',
  'Summarize my open tasks.',
  'What decisions were made recently?',
  'What has been rolling over the most?',
]

const TYPE_ICONS: Record<string, RemixiconComponentType> = {
  journal: RiBookOpenLine,
  task: RiCheckboxLine,
  transcript: RiFileList3Line,
}

const TYPE_VARIANTS: Record<string, 'indigo' | 'green' | 'blue'> = {
  journal: 'indigo', task: 'green', transcript: 'blue',
}

const TYPE_LABELS: Record<string, string> = {
  journal: 'Journal', task: 'Task', transcript: 'Meeting',
}

// ─── Plain text helper ────────────────────────────────────────────────────────

function toPlain(text: string | null | undefined): string {
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

// ─── Date range parser ────────────────────────────────────────────────────────

interface DateRange { start?: string; end?: string }

function parseDateRange(question: string): DateRange {
  const q = question.toLowerCase()
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

  if (q.includes('today'))
    return { start: fmt(today), end: fmt(today) }
  if (q.includes('yesterday'))
    return { start: fmt(subDays(today, 1)), end: fmt(subDays(today, 1)) }
  if (q.includes('this week'))
    return { start: fmt(startOfWeek(today, { weekStartsOn: 1 })), end: fmt(endOfWeek(today, { weekStartsOn: 1 })) }
  if (q.includes('last week')) {
    const ls = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })
    return { start: fmt(ls), end: fmt(endOfWeek(ls, { weekStartsOn: 1 })) }
  }
  if (q.includes('this month'))
    return { start: fmt(startOfMonth(today)), end: fmt(endOfMonth(today)) }
  if (q.includes('last month')) {
    const lm = subMonths(today, 1)
    return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)) }
  }
  if (q.includes('recent') || q.includes('recently'))
    return { start: fmt(subDays(today, 30)) }
  return {}
}

// ─── Data fetcher + normalizer ────────────────────────────────────────────────

async function fetchRecords(question: string): Promise<SearchableRecord[]> {
  const dateRange = parseDateRange(question)

  const [
    { data: journals },
    { data: tasks },
    { data: transcripts },
    { data: taskProjects },
    { data: transcriptProjects },
    { data: taskTags },
    { data: transcriptTags },
  ] = await Promise.all([
    supabase.from('journal_entries')
      .select('id, entry_date, focus, accomplished, needs_attention, reflection')
      .is('archived_at', null),
    supabase.from('tasks')
      .select('id, title, notes, status, priority, created_at')
      .is('archived_at', null),
    supabase.from('transcripts')
      .select('id, meeting_title, meeting_date, attendees, raw_transcript, summary, decisions, action_items, follow_ups')
      .is('archived_at', null),
    supabase.from('task_projects').select('task_id, projects(name)'),
    supabase.from('transcript_projects').select('transcript_id, projects(name)'),
    supabase.from('task_tags').select('task_id, tags(name)'),
    supabase.from('transcript_tags').select('transcript_id, tags(name)'),
  ])

  // Build lookup maps
  const taskProjMap = new Map<string, string[]>()
  for (const row of (taskProjects ?? []) as any[]) {
    if (!row.task_id || !row.projects?.name) continue
    taskProjMap.set(row.task_id, [...(taskProjMap.get(row.task_id) ?? []), row.projects.name])
  }

  const transcriptProjMap = new Map<string, string[]>()
  for (const row of (transcriptProjects ?? []) as any[]) {
    if (!row.transcript_id || !row.projects?.name) continue
    transcriptProjMap.set(row.transcript_id, [...(transcriptProjMap.get(row.transcript_id) ?? []), row.projects.name])
  }

  const taskTagMap = new Map<string, string[]>()
  for (const row of (taskTags ?? []) as any[]) {
    if (!row.task_id || !row.tags?.name) continue
    taskTagMap.set(row.task_id, [...(taskTagMap.get(row.task_id) ?? []), row.tags.name])
  }

  const transcriptTagMap = new Map<string, string[]>()
  for (const row of (transcriptTags ?? []) as any[]) {
    if (!row.transcript_id || !row.tags?.name) continue
    transcriptTagMap.set(row.transcript_id, [...(transcriptTagMap.get(row.transcript_id) ?? []), row.tags.name])
  }

  const records: SearchableRecord[] = []

  // Journals
  for (const j of (journals ?? []) as any[]) {
    if (dateRange.start && j.entry_date < dateRange.start) continue
    if (dateRange.end && j.entry_date > dateRange.end) continue
    const body = [j.focus, j.accomplished, j.needs_attention, j.reflection].map(toPlain).filter(Boolean).join(' ')
    records.push({
      id: j.id,
      type: 'journal',
      title: toPlain(j.focus) || `Journal — ${j.entry_date}`,
      date: j.entry_date,
      body,
      projects: [],
      tags: [],
      url: `/journal/${j.entry_date}`,
    })
  }

  // Tasks
  for (const t of (tasks ?? []) as any[]) {
    const body = [t.title, toPlain(t.notes)].filter(Boolean).join(' ')
    records.push({
      id: t.id,
      type: 'task',
      title: t.title,
      date: t.created_at?.slice(0, 10),
      body,
      status: t.status,
      projects: taskProjMap.get(t.id) ?? [],
      tags: taskTagMap.get(t.id) ?? [],
      url: '/tasks',
    })
  }

  // Transcripts
  for (const t of (transcripts ?? []) as any[]) {
    if (dateRange.start && t.meeting_date) {
      if (t.meeting_date < dateRange.start) continue
    }
    if (dateRange.end && t.meeting_date) {
      if (t.meeting_date > dateRange.end) continue
    }
    const body = [
      t.meeting_title, t.attendees,
      toPlain(t.raw_transcript), t.summary, t.decisions, t.action_items, t.follow_ups,
    ].filter(Boolean).join(' ')
    records.push({
      id: t.id,
      type: 'transcript',
      title: t.meeting_title,
      date: t.meeting_date,
      body,
      projects: transcriptProjMap.get(t.id) ?? [],
      tags: transcriptTagMap.get(t.id) ?? [],
      url: `/transcripts/${t.id}`,
    })
  }

  return records
}

// ─── Retrieval: fuzzy + project/keyword boost ─────────────────────────────────

const MAX_RECORDS = 30

function rankRecords(records: SearchableRecord[], question: string): SearchableRecord[] {
  if (!records.length) return []

  const q = question.toLowerCase()

  // Fuse search on body + title
  const fuse = new Fuse(records, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'projects', weight: 2 },
      { name: 'tags', weight: 2 },
      { name: 'body', weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })

  // Detect if question references specific project/tag names
  const projectBoostIds = new Set<string>()
  for (const r of records) {
    const projectHit = r.projects.some(p => q.includes(p.toLowerCase()))
    const tagHit = r.tags.some(t => q.includes(t.toLowerCase()))
    if (projectHit || tagHit) projectBoostIds.add(r.id)
  }

  const fuseResults = fuse.search(question)
  const fuseMap = new Map(fuseResults.map(r => [r.item.id, r.score ?? 1]))

  // Records not in fuse results get score 1 (worst)
  const scored = records.map(r => ({
    record: r,
    score: (fuseMap.get(r.id) ?? 0.8) * (projectBoostIds.has(r.id) ? 0.1 : 1),
  }))

  // Sort by score (lower = better in fuse)
  scored.sort((a, b) => a.score - b.score)

  return scored.slice(0, MAX_RECORDS).map(s => s.record)
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({ source, onClose }: { source: AskDataSource; onClose: () => void }) {
  const Icon = TYPE_ICONS[source.type] ?? RiBookOpenLine
  return (
    <Link
      to={source.url}
      onClick={onClose}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-indigo-200 transition-colors group"
    >
      <Icon size={14} className="text-gray-400 mt-0.5 shrink-0 group-hover:text-indigo-500 transition-colors" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={TYPE_VARIANTS[source.type]} className="text-xs">{TYPE_LABELS[source.type]}</Badge>
          <p className="text-xs font-medium text-gray-700 truncate">{source.title}</p>
          {source.date && <p className="text-xs text-gray-400">{source.date}</p>}
        </div>
        {source.preview && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{source.preview}</p>
        )}
      </div>
      <RiArrowRightSLine size={14} className="text-gray-300 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
    </Link>
  )
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function AskDataDrawer({ open, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // Scroll to bottom when messages change
  useEffect(() => {
    const streaming = messages.some(m => m.isStreaming)
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'instant' : 'smooth' })
  }, [messages, loading])

  // Typewriter: advance displayLength by ~3 chars every 18ms (~167 chars/sec)
  useEffect(() => {
    const idx = messages.findIndex(m => m.isStreaming)
    if (idx === -1) return

    const msg = messages[idx]
    const current = msg.displayLength ?? 0

    if (current >= msg.content.length) {
      setMessages(prev => prev.map((m, i) => i === idx ? { ...m, isStreaming: false } : m))
      return
    }

    const t = setTimeout(() => {
      setMessages(prev => prev.map((m, i) =>
        i === idx
          ? { ...m, displayLength: Math.min((m.displayLength ?? 0) + 3, m.content.length) }
          : m
      ))
    }, 18)
    return () => clearTimeout(t)
  }, [messages])

  // Keyboard shortcut to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const submit = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return

    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      const allRecords = await fetchRecords(q)
      const ranked = rankRecords(allRecords, q)
      const result = await askData(q, ranked)
      // Start typewriter: reveal 0 chars initially, drive via useEffect below
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
        isStreaming: true,
        displayLength: 0,
      }])
    } catch (e: any) {
      setError(e.message ?? 'Ask Your Data is unavailable right now. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input) }
  }

  const clearConversation = () => {
    setMessages([])
    setError(null)
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const isEmpty = messages.length === 0

  // Push drawer: width animates open/closed; main content compresses naturally.
  // The outer motion.div clips overflow; the inner div is always 480px wide so
  // content doesn't reflow during the animation.
  return (
    <motion.div
      className="shrink-0 flex flex-col h-full overflow-hidden border-l border-gray-200 bg-white"
      animate={{ width: open ? 480 : 0 }}
      initial={{ width: 0 }}
      transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* Fixed-width inner panel — never reflows during animation */}
      <div className="w-[480px] h-full flex flex-col">
            {/* ── Header ── */}
            <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <RiSparklingLine size={16} className="text-indigo-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Ask Your Data</h2>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Search and summarize your journals, tasks, and transcripts.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100 shrink-0"
              >
                <RiCloseLine size={18} />
              </button>
            </div>

            {/* ── Messages / Suggested prompts ── */}
            <div className="flex-1 overflow-y-auto">
              {isEmpty ? (
                <div className="p-5 space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Try asking…</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_PROMPTS.map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => submit(prompt)}
                        className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-5">
                  {messages.map((msg, i) => (
                    <div key={i}>
                      {msg.role === 'user' ? (
                        /* User bubble */
                        <div className="flex justify-end">
                          <div className="max-w-[85%] bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-md leading-relaxed">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        /* Assistant response */
                        (() => {
                          const displayed = msg.isStreaming
                            ? msg.content.slice(0, msg.displayLength ?? 0)
                            : msg.content
                          return (
                            <div className="space-y-3">
                              <div className="flex items-start gap-2.5">
                                <div className={`shrink-0 mt-0.5 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center ${msg.isStreaming ? 'animate-pulse' : ''}`}>
                                  <RiSparklingLine size={12} className="text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <MarkdownContent
                                    content={displayed}
                                    className="[&_p]:my-1 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs text-sm"
                                  />
                                  {msg.isStreaming && (
                                    <span className="inline-block w-0.5 h-3.5 bg-gray-500 align-middle ml-0.5 animate-pulse" />
                                  )}
                                </div>
                              </div>

                              {!msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                                <div className="ml-8 space-y-2">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sources</p>
                                  {msg.sources.map(source => (
                                    <SourceCard key={`${source.type}-${source.id}`} source={source} onClose={onClose} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()
                      )}
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {loading && (
                    <div className="flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
                        <RiSparklingLine size={12} className="text-indigo-600" />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-400 animate-pulse pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* ── Input ── */}
            <div className="shrink-0 px-4 py-3 border-t border-gray-100 space-y-2">
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your journals, tasks, or transcripts..."
                  disabled={loading}
                  className="flex-1 text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-50"
                />
                <button
                  onClick={() => submit(input)}
                  disabled={!input.trim() || loading}
                  className="shrink-0 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RiSendPlane2Line size={16} />
                </button>
              </div>

              {!isEmpty && (
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-300">Press Enter to send</p>
                  <button
                    onClick={clearConversation}
                    className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <RiDeleteBinLine size={11} /> Clear conversation
                  </button>
                </div>
              )}
            </div>
      </div>
    </motion.div>
  )
}
