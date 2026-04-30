import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Transcript } from '../types'
import { useProjects } from '../hooks/useProjects'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard } from '../components/ui/Skeleton'

const PAGE_SIZE = 30

function stripMarkup(text: string): string {
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

/** Return the display month label for a transcript, falling back to created_at */
function monthLabel(t: Transcript): string {
  const dateStr = t.meeting_date ?? t.created_at?.slice(0, 10)
  if (!dateStr) return 'Unknown'
  try { return format(new Date(dateStr + 'T12:00:00'), 'MMMM yyyy') } catch { return 'Unknown' }
}

// transcriptId → [project names]
type ProjectMap = Record<string, string[]>

export function TranscriptsListPage() {
  const navigate = useNavigate()
  const { projects: allProjects } = useProjects()

  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [projectFilter, setProjectFilter] = useState('')
  const [projectMap, setProjectMap] = useState<ProjectMap>({})

  const [modalOpen, setModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const buildQuery = (from: number, to: number) => {
    let q = supabase.from('transcripts').select('*', { count: 'exact' }).is('archived_at', null)
    if (sort === 'date-desc') {
      q = q.order('meeting_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    } else if (sort === 'date-asc') {
      q = q.order('meeting_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    } else {
      q = q.order('created_at', { ascending: sort === 'oldest' })
    }
    return q.range(from, to)
  }

  // Fetch project associations for all transcripts (global, not paginated)
  const fetchProjectMap = async () => {
    const { data } = await supabase
      .from('transcript_projects')
      .select('transcript_id, projects(name)')
    const map: ProjectMap = {}
    for (const row of (data ?? []) as any[]) {
      if (!row.transcript_id || !row.projects?.name) continue
      if (!map[row.transcript_id]) map[row.transcript_id] = []
      map[row.transcript_id].push(row.projects.name)
    }
    setProjectMap(map)
  }

  // Reset and re-fetch when sort changes
  useEffect(() => {
    setLoading(true)
    setTranscripts([])
    Promise.all([
      buildQuery(0, PAGE_SIZE - 1),
      fetchProjectMap(),
    ]).then(([{ data, count }]) => {
      setTranscripts(data ?? [])
      setTotalCount(count ?? 0)
      setLoading(false)
    })
  }, [sort])

  const loadMore = async () => {
    setLoadingMore(true)
    const { data } = await buildQuery(transcripts.length, transcripts.length + PAGE_SIZE - 1)
    setTranscripts(prev => [...prev, ...(data ?? [])])
    setLoadingMore(false)
  }

  const hasMore = transcripts.length < totalCount
  const canLoadMore = hasMore && !search && !projectFilter

  // Client-side filter across loaded records
  const filtered = useMemo(() => transcripts.filter(t => {
    if (projectFilter) {
      const tProjects = projectMap[t.id] ?? []
      if (!tProjects.includes(projectFilter)) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.meeting_title.toLowerCase().includes(q) ||
      t.attendees?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q) ||
      t.decisions?.toLowerCase().includes(q) ||
      t.action_items?.toLowerCase().includes(q) ||
      t.raw_transcript?.toLowerCase().includes(q)
    )
  }), [transcripts, search, projectFilter, projectMap])

  // Group by month when not searching/filtering
  const grouped = useMemo(() => {
    if (search || projectFilter) return null
    const groups = new Map<string, Transcript[]>()
    for (const t of filtered) {
      const key = monthLabel(t)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }
    return Array.from(groups.entries())
  }, [filtered, search, projectFilter])

  const openModal = () => { setNewTitle(''); setModalOpen(true) }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('transcripts')
      .insert({ user_id: user!.id, meeting_title: newTitle.trim() })
      .select()
      .single()
    setCreating(false)
    setModalOpen(false)
    if (data) navigate(`/transcripts/${data.id}?edit=true`)
  }

  const TranscriptRow = ({ t }: { t: Transcript }) => {
    const tProjects = projectMap[t.id] ?? []
    return (
      <Link
        to={`/transcripts/${t.id}`}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors group"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{t.meeting_title}</p>
          <div className="flex gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
            {t.meeting_date && <span>{t.meeting_date}</span>}
            {t.attendees && <span className="truncate">{t.attendees}</span>}
            {tProjects.map(p => (
              <span key={p} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">{p}</span>
            ))}
          </div>
          {(t.summary || t.raw_transcript) && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {t.summary ? t.summary : stripMarkup(t.raw_transcript ?? '')}
            </p>
          )}
        </div>
        <RiArrowRightSLine size={18} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
      </Link>
    )
  }

  const subtitle = loading
    ? 'Loading…'
    : search || projectFilter
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}${hasMore ? ` (of ${transcripts.length} loaded)` : ''}`
      : `${totalCount} meeting${totalCount !== 1 ? 's' : ''} logged`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <Button onClick={openModal}>+ New meeting note</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search meeting notes..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        {allProjects.length > 0 && (
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        )}
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-52">
          <option value="newest">Created: newest first</option>
          <option value="oldest">Created: oldest first</option>
          <option value="date-desc">Meeting date: newest</option>
          <option value="date-asc">Meeting date: oldest</option>
        </Select>
      </div>

      {loading ? (
        <SkListCard rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No meeting notes yet"
          description="Paste meeting notes here so decisions, action items, and follow-ups are easier to find later."
          action={!search && !projectFilter ? { label: '+ New meeting note', onClick: openModal } : undefined}
        />
      ) : grouped ? (
        /* Grouped by month view */
        <div className="space-y-6">
          {grouped.map(([label, items]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{label}</p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {items.map(t => <TranscriptRow key={t.id} t={t} />)}
              </div>
            </div>
          ))}

          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
              <p className="text-xs text-gray-400">{transcripts.length} of {totalCount} meetings loaded</p>
            </div>
          )}
        </div>
      ) : (
        /* Flat search/filter results */
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(t => <TranscriptRow key={t.id} t={t} />)}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New meeting note" size="sm">
        <div className="space-y-4">
          <Input
            label="Meeting title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="e.g. Q2 Planning, Design Review..."
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newTitle.trim()}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
