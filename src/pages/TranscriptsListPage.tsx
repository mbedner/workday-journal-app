import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { format, startOfWeek, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Transcript } from '../types'
import { useProjects } from '../hooks/useProjects'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard, SkGridCards, SkCalendar } from '../components/ui/Skeleton'
import { FilterSheet, FilterTrigger, FilterRow } from '../components/ui/FilterSheet'
import { ProjectTag } from '../components/ui/ProjectTag'
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle'
import { CalendarView, CalendarItem } from '../components/ui/CalendarView'

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

// transcriptId → [project names]
type ProjectMap = Record<string, string[]>
type GroupBy = 'none' | 'project' | 'week' | 'month'

function groupDateLabel(dateStr: string, mode: 'week' | 'month'): string {
  try {
    const d = parseISO(dateStr)
    if (mode === 'week') {
      const start = startOfWeek(d, { weekStartsOn: 1 })
      return `Week of ${format(start, 'MMM d, yyyy')}`
    }
    return format(d, 'MMMM yyyy')
  } catch { return 'Unknown' }
}
function groupDateSortKey(dateStr: string, mode: 'week' | 'month'): string {
  try {
    const d = parseISO(dateStr)
    if (mode === 'week') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return dateStr.slice(0, 7)
  } catch { return '' }
}

export function TranscriptsListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects: allProjects } = useProjects()

  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? '')
  const [projectMap, setProjectMap] = useState<ProjectMap>({})

  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('transcripts-view') as ViewMode) ?? 'list'
  )
  const handleViewChange = (v: ViewMode) => { setView(v); localStorage.setItem('transcripts-view', v) }
  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => (localStorage.getItem('transcripts-groupby') as GroupBy) ?? 'month'
  )
  const handleGroupByChange = (v: GroupBy) => { setGroupBy(v); localStorage.setItem('transcripts-groupby', v) }
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const nameToId = useMemo(
    () => Object.fromEntries(allProjects.map(p => [p.name, p.id])),
    [allProjects]
  )

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

  // Unified groupedItems — groups by project, week, or month
  const groupedItems = useMemo((): [string, Transcript[]][] | null => {
    if (groupBy === 'none' || view === 'calendar') return null
    const groups = new Map<string, Transcript[]>()
    const groupSortKey = new Map<string, string>()
    if (groupBy === 'project') {
      for (const t of filtered) {
        const projects = projectMap[t.id] ?? []
        if (projects.length === 0) {
          if (!groups.has('__none__')) groups.set('__none__', [])
          groups.get('__none__')!.push(t)
        } else {
          for (const p of projects) {
            if (!groups.has(p)) groups.set(p, [])
            groups.get(p)!.push(t)
          }
        }
      }
      return Array.from(groups.entries()).sort(([a], [b]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        return a.localeCompare(b)
      })
    }
    // week or month
    for (const t of filtered) {
      const dateStr = (t.meeting_date ?? t.created_at?.slice(0, 10)) ?? ''
      if (!dateStr) continue
      const label = groupDateLabel(dateStr, groupBy as 'week' | 'month')
      const sortKey = groupDateSortKey(dateStr, groupBy as 'week' | 'month')
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(t)
      if (!groupSortKey.has(label) || sortKey > groupSortKey.get(label)!) groupSortKey.set(label, sortKey)
    }
    return Array.from(groups.entries()).sort(([a], [b]) =>
      (groupSortKey.get(b) ?? '').localeCompare(groupSortKey.get(a) ?? '')
    )
  }, [filtered, projectMap, groupBy, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayLabel = (label: string) => label === '__none__' ? 'No project' : label

  const calendarItems: CalendarItem[] = useMemo(() => filtered
    .filter(t => t.meeting_date)
    .map(t => ({
      id: t.id,
      date: t.meeting_date!,
      label: t.meeting_title,
      url: `/transcripts/${t.id}`,
      color: 'indigo' as const,
    })), [filtered])

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
              <ProjectTag key={p} name={p} projectId={nameToId[p]} />
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

  const GridCard = ({ t }: { t: Transcript }) => {
    const tProjects = projectMap[t.id] ?? []
    const dateLabel = t.meeting_date
      ? (() => { try { return format(new Date(t.meeting_date + 'T12:00:00'), 'MMM d, yyyy') } catch { return t.meeting_date } })()
      : null
    return (
      <Link
        to={`/transcripts/${t.id}`}
        className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm hover:border-indigo-200 transition-all"
      >
        <div>
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{t.meeting_title}</p>
          {(dateLabel || t.attendees) && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {[dateLabel, t.attendees].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {(t.summary || t.raw_transcript) && (
          <p className="text-xs text-gray-500 line-clamp-3 flex-1 leading-relaxed">
            {t.summary ? t.summary : stripMarkup(t.raw_transcript ?? '')}
          </p>
        )}
        {tProjects.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-auto pt-1">
            {tProjects.map(p => (
              <span key={p} className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">{p}</span>
            ))}
          </div>
        )}
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
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={handleViewChange} />
          <Button onClick={openModal}>+ New meeting note</Button>
        </div>
      </div>

      {/* Mobile: search + filter trigger */}
      <div className="flex gap-2 sm:hidden">
        <div className="flex-1 min-w-0">
          <Input placeholder="Search meeting notes..." value={search} onChange={e => setSearch(e.target.value)} className="w-full" />
        </div>
        <FilterTrigger
          onClick={() => setFilterSheetOpen(true)}
          activeCount={[projectFilter, groupBy !== 'none' ? groupBy : '', sort !== 'date-desc' ? sort : ''].filter(Boolean).length}
        />
      </div>

      {/* Desktop: full inline filter bar */}
      <div className="hidden sm:flex gap-3 flex-wrap">
        <Input placeholder="Search meeting notes..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        {allProjects.length > 0 && (
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        )}
        <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as GroupBy)} className="w-44">
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="week">Group by week</option>
          <option value="month">Group by month</option>
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-52">
          <option value="newest">Created: newest first</option>
          <option value="oldest">Created: oldest first</option>
          <option value="date-desc">Meeting date: newest</option>
          <option value="date-asc">Meeting date: oldest</option>
        </Select>
      </div>

      {/* Mobile filter sheet */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeCount={[projectFilter, groupBy !== 'none' ? groupBy : '', sort !== 'date-desc' ? sort : ''].filter(Boolean).length}
      >
        {allProjects.length > 0 && (
          <FilterRow label="Project">
            <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-full">
              <option value="">All projects</option>
              {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          </FilterRow>
        )}
        <FilterRow label="Group by">
          <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as GroupBy)} className="w-full">
            <option value="none">No grouping</option>
            <option value="project">Group by project</option>
            <option value="week">Group by week</option>
            <option value="month">Group by month</option>
          </Select>
        </FilterRow>
        <FilterRow label="Sort">
          <Select value={sort} onChange={e => setSort(e.target.value)} className="w-full">
            <option value="newest">Created: newest first</option>
            <option value="oldest">Created: oldest first</option>
            <option value="date-desc">Meeting date: newest</option>
            <option value="date-asc">Meeting date: oldest</option>
          </Select>
        </FilterRow>
      </FilterSheet>

      {loading ? (
        view === 'calendar' ? <SkCalendar /> :
        view === 'grid'     ? <SkGridCards count={6} /> :
        <SkListCard rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No meeting notes yet"
          description="Paste meeting notes here so decisions, action items, and follow-ups are easier to find later."
          action={!search && !projectFilter ? { label: '+ New meeting note', onClick: openModal } : undefined}
        />
      ) : view === 'calendar' ? (
        <>
          <CalendarView items={calendarItems} />
          {filtered.filter(t => !t.meeting_date).length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {filtered.filter(t => !t.meeting_date).length} meeting{filtered.filter(t => !t.meeting_date).length !== 1 ? 's' : ''} without a date not shown on calendar.
            </p>
          )}
        </>
      ) : view === 'grid' ? (
        <>
          {groupedItems ? (
            <div className="space-y-6">
              {groupedItems.map(([group, items]) => (
                <div key={group}>
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                      {displayLabel(group)}
                    </p>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-300 shrink-0">{items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(t => <GridCard key={t.id} t={t} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(t => <GridCard key={t.id} t={t} />)}
            </div>
          )}
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{transcripts.length} of {totalCount} meetings loaded</p>
            </div>
          )}
        </>
      ) : groupedItems ? (
        /* Grouped list */
        <div className="space-y-4">
          {groupedItems.map(([label, items]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{displayLabel(label)}</p>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-300 shrink-0">{items.length}</span>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {items.map(t => <TranscriptRow key={t.id} t={t} />)}
              </div>
            </div>
          ))}
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{transcripts.length} of {totalCount} meetings loaded</p>
            </div>
          )}
        </div>
      ) : (
        /* Flat search/filter list */
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
