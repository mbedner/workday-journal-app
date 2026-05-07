import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry } from '../types'
import { useProjects } from '../hooks/useProjects'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { StarRating } from '../components/ui/StarRating'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard, SkGridCards, SkCalendar } from '../components/ui/Skeleton'
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle'
import { CalendarView, CalendarItem } from '../components/ui/CalendarView'
import { FilterSheet, FilterTrigger, FilterRow } from '../components/ui/FilterSheet'
import { ProjectTag } from '../components/ui/ProjectTag'

const PAGE_SIZE = 60

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

type ProjectMap = Record<string, string[]>

export function JournalListPage() {
  const navigate = useNavigate()
  const { projects: allProjects } = useProjects()
  const [searchParams] = useSearchParams()

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? '')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [projectMap, setProjectMap] = useState<ProjectMap>({})
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('journal-view') as ViewMode) ?? 'list'
  )
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  const handleViewChange = (v: ViewMode) => {
    setView(v)
    localStorage.setItem('journal-view', v)
  }

  const fetchProjectMap = async () => {
    const { data } = await supabase
      .from('journal_entry_projects')
      .select('journal_entry_id, projects(name)')
    const map: ProjectMap = {}
    for (const row of (data ?? []) as any[]) {
      if (!row.journal_entry_id || !row.projects?.name) continue
      if (!map[row.journal_entry_id]) map[row.journal_entry_id] = []
      map[row.journal_entry_id].push(row.projects.name)
    }
    setProjectMap(map)
  }

  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('journal_entries')
      .select('*', { count: 'exact' })
      .is('archived_at', null)
    if (ratingFilter) q = q.eq('productivity_rating', parseInt(ratingFilter))
    return q.order('entry_date', { ascending: sort === 'oldest' }).range(from, to)
  }

  useEffect(() => {
    setLoading(true)
    setEntries([])
    Promise.all([
      buildQuery(0, PAGE_SIZE - 1),
      fetchProjectMap(),
    ]).then(([{ data, count }]) => {
      setEntries(data ?? [])
      setTotalCount(count ?? 0)
      setLoading(false)
    })
  }, [sort, ratingFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setLoadingMore(true)
    const { data } = await buildQuery(entries.length, entries.length + PAGE_SIZE - 1)
    setEntries(prev => [...prev, ...(data ?? [])])
    setLoadingMore(false)
  }

  const hasMore = entries.length < totalCount

  const filtered = useMemo(() => entries.filter(e => {
    if (projectFilter) {
      const eProjects = projectMap[e.id] ?? []
      if (!eProjects.includes(projectFilter)) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        e.focus?.toLowerCase().includes(q) ||
        e.accomplished?.toLowerCase().includes(q) ||
        e.needs_attention?.toLowerCase().includes(q) ||
        e.reflection?.toLowerCase().includes(q) ||
        e.entry_date.includes(q)
      )
    }
    return true
  }), [entries, search, projectFilter, projectMap])

  const canLoadMore = hasMore && !search && !projectFilter

  const grouped = useMemo(() => {
    if (search || ratingFilter || projectFilter || view === 'grid' || view === 'calendar') return null
    const groups = new Map<string, JournalEntry[]>()
    for (const entry of filtered) {
      const key = format(new Date(entry.entry_date + 'T12:00:00'), 'MMMM yyyy')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
    return Array.from(groups.entries())
  }, [filtered, search, ratingFilter, projectFilter, view])

  const calendarItems: CalendarItem[] = useMemo(() => filtered.map(e => ({
    id: e.id,
    date: e.entry_date,
    label: e.focus ? stripMarkup(e.focus).slice(0, 40) || 'Journal entry' : 'Journal entry',
    url: `/journal/${e.entry_date}`,
    color: 'indigo',
  })), [filtered])

  const nameToId = useMemo(
    () => Object.fromEntries(allProjects.map(p => [p.name, p.id])),
    [allProjects]
  )

  const isFiltering = !!(search || ratingFilter || projectFilter)

  const subtitle = loading
    ? 'Loading…'
    : search || projectFilter
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}${hasMore ? ` (of ${entries.length} loaded)` : ''}`
      : `${totalCount} entr${totalCount !== 1 ? 'ies' : 'y'}${canLoadMore ? ` · ${entries.length} loaded` : ''}`

  // ─── Sub-components ───────────────────────────────────────────────────────

  const EntryRow = ({ entry }: { entry: JournalEntry }) => {
    const eProjects = projectMap[entry.id] ?? []
    return (
      <Link
        to={`/journal/${entry.entry_date}`}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors group"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
            </span>
            {entry.entry_date === today && (
              <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
            )}
            {eProjects.map(p => (
              <ProjectTag key={p} name={p} projectId={nameToId[p]} />
            ))}
          </div>
          {entry.focus && (
            <p className="text-sm text-gray-600 truncate">{stripMarkup(entry.focus)}</p>
          )}
          {entry.productivity_rating && (
            <div className="mt-1">
              <StarRating value={entry.productivity_rating} readonly />
            </div>
          )}
        </div>
        <RiArrowRightSLine size={18} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
      </Link>
    )
  }

  const EntryCard = ({ entry }: { entry: JournalEntry }) => {
    const eProjects = projectMap[entry.id] ?? []
    const isToday = entry.entry_date === today
    return (
      <Link
        to={`/journal/${entry.entry_date}`}
        className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm hover:border-indigo-200 transition-all group"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-gray-400">
              {format(new Date(entry.entry_date + 'T12:00:00'), 'EEE, MMM d, yyyy')}
            </p>
            {isToday && (
              <span className="inline-block mt-0.5 text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
            )}
          </div>
          {entry.productivity_rating && (
            <StarRating value={entry.productivity_rating} readonly />
          )}
        </div>
        {entry.focus && (
          <p className="text-sm text-gray-700 line-clamp-3 leading-snug flex-1">
            {stripMarkup(entry.focus)}
          </p>
        )}
        {eProjects.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-auto pt-1">
            {eProjects.map(p => (
              <ProjectTag key={p} name={p} projectId={nameToId[p]} />
            ))}
          </div>
        )}
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Journal</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={handleViewChange} />
          <Button onClick={() => navigate(`/journal/${today}`)}>
            {entries.some(e => e.entry_date === today) ? "Open today's entry" : "Start today's entry"}
          </Button>
        </div>
      </div>

      {/* Mobile: search + filter trigger */}
      <div className="flex gap-2 sm:hidden">
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Search journals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <FilterTrigger
          onClick={() => setFilterSheetOpen(true)}
          activeCount={[projectFilter, ratingFilter, sort !== 'newest' ? sort : ''].filter(Boolean).length}
        />
      </div>

      {/* Desktop: full inline filter bar */}
      <div className="hidden sm:flex gap-3 flex-wrap">
        <Input
          placeholder="Search journals..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px]"
        />
        {allProjects.length > 0 && (
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        )}
        <Select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} className="w-36">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
        </Select>
        {view !== 'calendar' && (
          <Select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="w-32">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </Select>
        )}
      </div>

      {/* Mobile filter sheet */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeCount={[projectFilter, ratingFilter, sort !== 'newest' ? sort : ''].filter(Boolean).length}
      >
        {allProjects.length > 0 && (
          <FilterRow label="Project">
            <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-full">
              <option value="">All projects</option>
              {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          </FilterRow>
        )}
        <FilterRow label="Rating">
          <Select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} className="w-full">
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
          </Select>
        </FilterRow>
        {view !== 'calendar' && (
          <FilterRow label="Sort">
            <Select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="w-full">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </FilterRow>
        )}
      </FilterSheet>

      {loading ? (
        view === 'calendar' ? <SkCalendar /> :
        view === 'grid'     ? <SkGridCards count={6} /> :
        <SkListCard rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          description="Start today's journal to capture what you worked on, what moved forward, and what still needs attention."
          action={!isFiltering ? { label: "Start today's entry", onClick: () => navigate(`/journal/${today}`) } : undefined}
        />
      ) : view === 'calendar' ? (
        <CalendarView items={calendarItems} />
      ) : view === 'grid' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(entry => <EntryCard key={entry.id} entry={entry} />)}
          </div>
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{entries.length} of {totalCount} entries loaded</p>
            </div>
          )}
        </>
      ) : grouped ? (
        /* Grouped list by month */
        <div className="space-y-6">
          {grouped.map(([monthLabel, monthEntries]) => (
            <div key={monthLabel}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{monthLabel}</p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {monthEntries.map(entry => <EntryRow key={entry.id} entry={entry} />)}
              </div>
            </div>
          ))}
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{entries.length} of {totalCount} entries loaded</p>
            </div>
          )}
        </div>
      ) : (
        /* Flat search/filter list */
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(entry => <EntryRow key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  )
}
