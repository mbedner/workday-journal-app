import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry, Task, Transcript } from '../types'
import { RiArrowRightSLine } from '@remixicon/react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { StarRating } from '../components/ui/StarRating'

function statusVariant(status: Task['status']): 'yellow' | 'blue' | 'green' | 'red' | 'gray' {
  return { todo: 'yellow', in_progress: 'blue', done: 'green', blocked: 'red' }[status] as 'yellow' | 'blue' | 'green' | 'red'
}

function priorityVariant(p: Task['priority']): 'red' | 'yellow' | 'gray' {
  return { high: 'red', medium: 'yellow', low: 'gray' }[p] as 'red' | 'yellow' | 'gray'
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </Card>
  )
}

export function DashboardPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const navigate = useNavigate()
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null | undefined>(undefined)
  const [openTasks, setOpenTasks] = useState<Task[]>([])
  const [recentTranscripts, setRecentTranscripts] = useState<Transcript[]>([])
  const [weekTasks, setWeekTasks] = useState<Task[]>([])
  const [weekEntries, setWeekEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

    Promise.all([
      supabase.from('journal_entries').select('*').eq('entry_date', today).maybeSingle(),
      supabase.from('tasks').select('*').in('status', ['todo', 'in_progress', 'blocked']).order('created_at', { ascending: false }).limit(8),
      supabase.from('transcripts').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('tasks').select('*').gte('updated_at', weekStart).lte('updated_at', weekEnd + 'T23:59:59'),
      supabase.from('journal_entries').select('*').gte('entry_date', weekStart).lte('entry_date', weekEnd),
    ]).then(([je, tasks, transcripts, wt, we]) => {
      setTodayEntry(je.data)
      setOpenTasks(tasks.data ?? [])
      setRecentTranscripts(transcripts.data ?? [])
      setWeekTasks(wt.data ?? [])
      setWeekEntries(we.data ?? [])
      setLoading(false)
    })
  }, [today])

  const completedThisWeek = weekTasks.filter(t => t.status === 'done').length
  const blockedCount = openTasks.filter(t => t.status === 'blocked').length
  const inProgressCount = openTasks.filter(t => t.status === 'in_progress').length
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const meetingsThisWeek = recentTranscripts.filter(t => {
    if (!t.meeting_date) return false
    try { return isWithinInterval(parseISO(t.meeting_date), { start: weekStart, end: weekEnd }) } catch { return false }
  }).length
  const avgRating = weekEntries.filter(e => e.productivity_rating).length > 0
    ? (weekEntries.reduce((s, e) => s + (e.productivity_rating ?? 0), 0) / weekEntries.filter(e => e.productivity_rating).length).toFixed(1)
    : '—'

  if (loading) return <div className="animate-pulse text-gray-400 text-sm">Loading...</div>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h2>
        <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Today's journal */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Today</h3>
        <Card>
          {todayEntry ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">Today's journal</span>
                  <Badge variant="green">Entry exists</Badge>
                </div>
                {todayEntry.focus && <p className="text-sm text-gray-500 truncate">{todayEntry.focus}</p>}
                <div className="mt-2">
                  <StarRating value={todayEntry.productivity_rating} readonly />
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/journal/${today}`)}>
                Open
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">No entry yet for today</p>
                <p className="text-xs text-gray-400 mt-0.5">Capture what you worked on, what moved forward, and what still needs attention.</p>
              </div>
              <Button size="sm" onClick={() => navigate(`/journal/${today}`)}>
                Start today's journal
              </Button>
            </div>
          )}
        </Card>
      </section>

      {/* Productivity snapshot */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">This week</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Completed" value={completedThisWeek} sub="tasks" />
          <StatCard label="Open" value={openTasks.length - blockedCount} sub="tasks" />
          <StatCard label="In progress" value={inProgressCount} sub="tasks" />
          <StatCard label="Blocked" value={blockedCount} sub="tasks" />
          <StatCard label="Meetings" value={meetingsThisWeek} sub="logged" />
          <StatCard label="Avg rating" value={avgRating} sub="productivity" />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Open tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Open Tasks</h3>
            <Link to="/tasks" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
          </div>
          {openTasks.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 text-center py-4">No open tasks. Great work!</p>
            </Card>
          ) : (
            <Card padding={false}>
              <ul className="divide-y divide-gray-100">
                {openTasks.map(task => (
                  <li key={task.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge variant={statusVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
                        <Badge variant={priorityVariant(task.priority)}>{task.priority}</Badge>
                        {task.due_date && <span className="text-xs text-gray-400">Due {task.due_date}</span>}
                      </div>
                    </div>
                    <Link to="/tasks"><RiArrowRightSLine size={18} className="text-gray-300 hover:text-indigo-500 transition shrink-0" /></Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* Recent transcripts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Meetings</h3>
            <Link to="/transcripts" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
          </div>
          {recentTranscripts.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 text-center py-4">No meeting notes yet. Paste your first meeting summary.</p>
            </Card>
          ) : (
            <Card padding={false}>
              <ul className="divide-y divide-gray-100">
                {recentTranscripts.map(t => (
                  <li key={t.id}>
                    <Link
                      to={`/transcripts/${t.id}`}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition block"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.meeting_title}</p>
                        {t.meeting_date && <p className="text-xs text-gray-400">{t.meeting_date}</p>}
                        {t.summary && <p className="text-xs text-gray-500 truncate mt-0.5">{t.summary}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}
