import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry } from '../types'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { StarRating } from '../components/ui/StarRating'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard } from '../components/ui/Skeleton'

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

export function JournalListPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')

  const today = format(new Date(), 'yyyy-MM-dd')

  // Reset and re-fetch when sort changes
  useEffect(() => {
    setLoading(true)
    setEntries([])
    supabase
      .from('journal_entries')
      .select('*', { count: 'exact' })
      .is('archived_at', null)
      .order('entry_date', { ascending: sort === 'oldest' })
      .range(0, PAGE_SIZE - 1)
      .then(({ data, count }) => {
        setEntries(data ?? [])
        setTotalCount(count ?? 0)
        setLoading(false)
      })
  }, [sort])

  const loadMore = async () => {
    setLoadingMore(true)
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .is('archived_at', null)
      .order('entry_date', { ascending: sort === 'oldest' })
      .range(entries.length, entries.length + PAGE_SIZE - 1)
    setEntries(prev => [...prev, ...(data ?? [])])
    setLoadingMore(false)
  }

  const hasMore = entries.length < totalCount

  // Client-side filter across loaded entries
  const filtered = useMemo(() => entries.filter(e => {
    if (ratingFilter && e.productivity_rating !== parseInt(ratingFilter)) return false
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
  }), [entries, search, ratingFilter])

  // Group by month/year when not searching
  const grouped = useMemo(() => {
    if (search || ratingFilter) return null
    const groups = new Map<string, JournalEntry[]>()
    for (const entry of filtered) {
      const key = format(new Date(entry.entry_date + 'T12:00:00'), 'MMMM yyyy')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
    return Array.from(groups.entries())
  }, [filtered, search, ratingFilter])

  const EntryRow = ({ entry }: { entry: JournalEntry }) => (
    <Link
      to={`/journal/${entry.entry_date}`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-900">
            {format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
          </span>
          {entry.entry_date === today && (
            <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
          )}
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

  const subtitle = loading
    ? 'Loading…'
    : search || ratingFilter
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}${hasMore ? ` (of ${entries.length} loaded)` : ''}`
      : `${totalCount} entr${totalCount !== 1 ? 'ies' : 'y'}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Journal</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <Button onClick={() => navigate(`/journal/${today}`)}>
          {entries.some(e => e.entry_date === today) ? "Open today's entry" : "Start today's entry"}
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search journals..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px]"
        />
        <Select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} className="w-36">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="w-32">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </Select>
      </div>

      {loading ? (
        <SkListCard rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          description="Start today's journal to capture what you worked on, what moved forward, and what still needs attention."
          action={!search && !ratingFilter ? { label: "Start today's entry", onClick: () => navigate(`/journal/${today}`) } : undefined}
        />
      ) : grouped ? (
        /* Grouped by month view */
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

          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
              <p className="text-xs text-gray-400">{entries.length} of {totalCount} entries loaded</p>
            </div>
          )}
        </div>
      ) : (
        /* Flat search/filter results */
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(entry => <EntryRow key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  )
}
