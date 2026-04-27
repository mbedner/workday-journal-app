import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import Fuse from 'fuse.js'
import { supabase } from '../lib/supabase'
import { SearchResult } from '../types'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'

const typeVariants: Record<string, 'indigo' | 'green' | 'blue'> = {
  journal: 'indigo', task: 'green', transcript: 'blue',
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [allItems, setAllItems] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const fuseRef = useRef<Fuse<SearchResult> | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: journals }, { data: tasks }, { data: transcripts }] = await Promise.all([
        supabase.from('journal_entries').select(`
          id, entry_date, focus, accomplished, needs_attention, reflection,
          journal_entry_projects(projects(name)),
          journal_entry_tags(tags(name))
        `),
        supabase.from('tasks').select(`
          id, title, notes, status, priority, due_date, created_at,
          task_projects(projects(name)),
          task_tags(tags(name))
        `),
        supabase.from('transcripts').select(`
          id, meeting_title, meeting_date, attendees, summary, decisions, action_items, follow_ups, raw_transcript,
          transcript_projects(projects(name)),
          transcript_tags(tags(name))
        `),
      ])

      const items: SearchResult[] = [
        ...(journals ?? []).map((j: any) => ({
          id: j.id,
          type: 'journal' as const,
          title: j.focus || `Journal — ${j.entry_date}`,
          date: j.entry_date,
          body: [j.focus, j.accomplished, j.needs_attention, j.reflection].filter(Boolean).join(' '),
          tags: (j.journal_entry_tags ?? []).map((t: any) => t.tags?.name).filter(Boolean),
          projects: (j.journal_entry_projects ?? []).map((p: any) => p.projects?.name).filter(Boolean),
          url: `/journal/${j.entry_date}`,
        })),
        ...(tasks ?? []).map((t: any) => ({
          id: t.id,
          type: 'task' as const,
          title: t.title,
          date: t.created_at?.slice(0, 10),
          body: [t.title, t.notes, t.status, t.priority].filter(Boolean).join(' '),
          tags: (t.task_tags ?? []).map((r: any) => r.tags?.name).filter(Boolean),
          projects: (t.task_projects ?? []).map((r: any) => r.projects?.name).filter(Boolean),
          status: t.status,
          url: '/tasks',
        })),
        ...(transcripts ?? []).map((t: any) => ({
          id: t.id,
          type: 'transcript' as const,
          title: t.meeting_title,
          date: t.meeting_date,
          body: [t.meeting_title, t.attendees, t.summary, t.decisions, t.action_items, t.follow_ups, t.raw_transcript].filter(Boolean).join(' '),
          tags: (t.transcript_tags ?? []).map((r: any) => r.tags?.name).filter(Boolean),
          projects: (t.transcript_projects ?? []).map((r: any) => r.projects?.name).filter(Boolean),
          url: `/transcripts/${t.id}`,
        })),
      ]

      setAllItems(items)
      fuseRef.current = new Fuse(items, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'body', weight: 1 },
          { name: 'tags', weight: 1.5 },
          { name: 'projects', weight: 1.5 },
          { name: 'status', weight: 0.5 },
          { name: 'date', weight: 0.5 },
        ],
        threshold: 0.4,
        includeScore: true,
      })
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults(typeFilter ? allItems.filter(i => i.type === typeFilter) : [])
      return
    }
    if (!fuseRef.current) return
    let res = fuseRef.current.search(query).map(r => r.item)
    if (typeFilter) res = res.filter(r => r.type === typeFilter)
    setResults(res)
  }, [query, typeFilter, allItems])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Search</h1>
        <p className="text-sm text-gray-500">Search across journals, tasks, and transcripts</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search everything..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          className="flex-1 min-w-[240px]"
        />
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-40">
          <option value="">All types</option>
          <option value="journal">Journals</option>
          <option value="task">Tasks</option>
          <option value="transcript">Meeting Notes</option>
        </Select>
      </div>

      {loading ? (
        <div className="animate-pulse text-gray-400 text-sm">Loading search index...</div>
      ) : !query && !typeFilter ? (
        <div className="text-sm text-gray-400 text-center py-12">
          Start typing to search across {allItems.length} items
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="Try a project name, meeting title, task, or keyword."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          {results.map(r => (
            <Link key={`${r.type}-${r.id}`} to={r.url}>
              <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={typeVariants[r.type]}>{r.type}</Badge>
                      <span className="text-sm font-medium text-gray-900 truncate">{r.title}</span>
                    </div>
                    {r.date && <p className="text-xs text-gray-400 mb-1">{r.date}</p>}
                    <p className="text-xs text-gray-500 line-clamp-2">{r.body}</p>
                    {(r.projects.length > 0 || r.tags.length > 0) && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {r.projects.map(p => <Badge key={p} variant="gray">{p}</Badge>)}
                        {r.tags.map(t => <Badge key={t} variant="gray">{t}</Badge>)}
                      </div>
                    )}
                  </div>
                  <RiArrowRightSLine size={18} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
