import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { StarRating } from '../components/ui/StarRating'
import { EmptyState } from '../components/ui/EmptyState'

export function JournalListPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')

  useEffect(() => {
    setLoading(true)
    supabase
      .from('journal_entries')
      .select('*')
      .order('entry_date', { ascending: sort === 'oldest' })
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [sort])

  const today = format(new Date(), 'yyyy-MM-dd')

  const filtered = entries.filter(e => {
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
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Journal</h1>
          <p className="text-sm text-gray-500">All your daily work entries</p>
        </div>
        <Button onClick={() => navigate(`/journal/${today}`)}>
          {entries.some(e => e.entry_date === today) ? "Open today's journal" : "Start today's journal"}
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
        <div className="text-sm text-gray-400 animate-pulse">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          description="Start today's journal to capture what you worked on, what moved forward, and what still needs attention."
          action={{ label: "Start today's journal", onClick: () => navigate(`/journal/${today}`) }}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map(entry => (
            <Link key={entry.id} to={`/journal/${entry.entry_date}`}>
              <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">
                        {format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                      </span>
                      {entry.entry_date === today && (
                        <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
                      )}
                    </div>
                    {entry.focus && (
                      <p className="text-sm text-gray-700 font-medium truncate">{entry.focus}</p>
                    )}
                    {entry.accomplished && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{entry.accomplished}</p>
                    )}
                    <div className="mt-2">
                      <StarRating value={entry.productivity_rating} readonly />
                    </div>
                  </div>
                  <span className="text-gray-300 group-hover:text-indigo-400 transition shrink-0 text-lg">→</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
