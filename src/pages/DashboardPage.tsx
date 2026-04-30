import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format, startOfWeek, endOfWeek, parseISO, isWithinInterval, subMonths, addMonths, isPast, isToday } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry, Task, Transcript } from '../types'
import { RiArrowRightSLine, RiCircleLine, RiCheckboxCircleLine, RiSparklingLine } from '@remixicon/react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { StarRating } from '../components/ui/StarRating'
import { Sk, SkCalendar, SkListCard } from '../components/ui/Skeleton'
import { WeeklyRecapModal } from '../components/ui/WeeklyRecapModal'
import { CalendarView, CalendarItem } from '../components/ui/CalendarView'

function statusVariant(status: Task['status']): 'yellow' | 'blue' | 'green' | 'red' | 'gray' {
  return { todo: 'yellow', in_progress: 'blue', done: 'green', blocked: 'red' }[status] as 'yellow' | 'blue' | 'green' | 'red'
}

function priorityVariant(p: Task['priority']): 'red' | 'yellow' | 'gray' {
  return { high: 'red', medium: 'yellow', low: 'gray' }[p] as 'red' | 'yellow' | 'gray'
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3 sm:px-5 sm:py-4 flex flex-col gap-0.5">
      <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</span>
      <span className="text-xl sm:text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-[10px] sm:text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function stripMarkup(text: string): string {
  if (!text) return ''
  let plain = text.replace(/<[^>]+>/g, ' ')
  plain = plain
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return plain
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
  const [toggling, setToggling] = useState<string | null>(null)
  const [recapOpen, setRecapOpen] = useState(false)

  // Calendar data — 6 months back to 6 months forward
  const [calJournals, setCalJournals]       = useState<{ id: string; entry_date: string; focus: string | null }[]>([])
  const [calTranscripts, setCalTranscripts] = useState<{ id: string; meeting_title: string; meeting_date: string }[]>([])
  const [calTasks, setCalTasks]             = useState<{ id: string; title: string; due_date: string; priority: string; status: string }[]>([])
  const [calDoneTasks, setCalDoneTasks]     = useState<{ id: string; title: string; completed_at: string }[]>([])

  useEffect(() => {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const calFrom = format(subMonths(new Date(), 6), 'yyyy-MM-dd')
    const calTo   = format(addMonths(new Date(), 6), 'yyyy-MM-dd')

    Promise.all([
      supabase.from('journal_entries').select('*').eq('entry_date', today).maybeSingle(),
      supabase.from('tasks').select('*').in('status', ['todo', 'in_progress', 'blocked']).is('archived_at', null).order('created_at', { ascending: false }).limit(8),
      supabase.from('transcripts').select('*').is('archived_at', null).order('created_at', { ascending: false }).limit(5),
      supabase.from('tasks').select('*').is('archived_at', null).gte('updated_at', weekStart).lte('updated_at', weekEnd + 'T23:59:59'),
      supabase.from('journal_entries').select('*').gte('entry_date', weekStart).lte('entry_date', weekEnd),
      // Calendar feeds
      supabase.from('journal_entries').select('id, entry_date, focus').is('archived_at', null).gte('entry_date', calFrom).lte('entry_date', calTo),
      supabase.from('transcripts').select('id, meeting_title, meeting_date').is('archived_at', null).not('meeting_date', 'is', null).gte('meeting_date', calFrom).lte('meeting_date', calTo),
      supabase.from('tasks').select('id, title, due_date, priority, status').is('archived_at', null).neq('status', 'done').not('due_date', 'is', null).gte('due_date', calFrom).lte('due_date', calTo),
      supabase.from('tasks').select('id, title, completed_at').is('archived_at', null).eq('status', 'done').not('completed_at', 'is', null).gte('completed_at', calFrom).lte('completed_at', calTo),
    ]).then(([je, tasks, transcripts, wt, we, cj, ct, ctasks, cdonetasks]) => {
      setTodayEntry(je.data)
      setOpenTasks(tasks.data ?? [])
      setRecentTranscripts(transcripts.data ?? [])
      setWeekTasks(wt.data ?? [])
      setWeekEntries(we.data ?? [])
      setCalJournals(cj.data ?? [])
      setCalTranscripts(ct.data ?? [])
      setCalTasks(ctasks.data ?? [])
      setCalDoneTasks(cdonetasks.data ?? [])
      setLoading(false)
    })
  }, [today])

  const toggleDone = async (task: Task) => {
    setToggling(task.id)
    const newStatus: Task['status'] = 'done'
    const patch = { status: newStatus, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }
    await supabase.from('tasks').update(patch).eq('id', task.id)
    setOpenTasks(prev => prev.filter(t => t.id !== task.id))
    setToggling(null)
  }

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

  const calendarItems: CalendarItem[] = useMemo(() => [
    // Journal entries — indigo
    ...calJournals.map(e => ({
      id: `j-${e.id}`,
      date: e.entry_date,
      label: e.focus ? e.focus.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 40) || 'Journal' : 'Journal',
      url: `/journal/${e.entry_date}`,
      color: 'indigo' as const,
    })),
    // Meeting notes — indigo-ish (using gray to distinguish from journals)
    ...calTranscripts.map(t => ({
      id: `t-${t.id}`,
      date: t.meeting_date!,
      label: t.meeting_title,
      url: `/transcripts/${t.id}`,
      color: 'green' as const,
    })),
    // Open/in-progress/blocked tasks by due date — yellow or red if overdue/high priority
    ...calTasks.map(t => {
      const overdue = t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
      return {
        id: `task-${t.id}`,
        date: t.due_date!,
        label: t.title,
        url: `/tasks/${t.id}`,
        color: (overdue || t.priority === 'high' ? 'red' : 'yellow') as 'red' | 'yellow',
      }
    }),
    // Completed tasks by completion date — gray
    ...calDoneTasks.map(t => ({
      id: `done-${t.id}`,
      date: t.completed_at.slice(0, 10),
      label: t.title,
      url: '/tasks',
      color: 'gray' as const,
    })),
  ], [calJournals, calTranscripts, calTasks, calDoneTasks])

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      {/* Greeting */}
      <div className="space-y-1.5">
        <Sk className="h-7 w-44" />
        <Sk className="h-3.5 w-52" />
      </div>
      {/* Today card */}
      <div className="space-y-3">
        <Sk className="h-2.5 w-12" />
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Sk className="h-3.5 w-40" />
            <Sk className="h-3 w-72 max-w-full" />
            <Sk className="h-3 w-24 rounded-full" />
          </div>
          <Sk className="h-8 w-16 rounded-lg shrink-0" />
        </div>
      </div>
      {/* Stats row */}
      <div className="space-y-3">
        <Sk className="h-2.5 w-20" />
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-4 space-y-2">
              <Sk className="h-2 w-full max-w-[56px]" />
              <Sk className="h-7 w-6" />
              <Sk className="h-2 w-full max-w-[40px]" />
            </div>
          ))}
        </div>
      </div>
      {/* Calendar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Sk className="h-2.5 w-16" />
          <div className="flex items-center gap-3">
            {[...Array(4)].map((_, i) => <Sk key={i} className="h-2.5 w-16" />)}
          </div>
        </div>
        <SkCalendar />
      </div>
      {/* Two-column sections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Sk className="h-2.5 w-24" />
            <Sk className="h-2.5 w-12" />
          </div>
          <SkListCard rows={3} />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Sk className="h-2.5 w-32" />
            <Sk className="h-2.5 w-12" />
          </div>
          <SkListCard rows={3} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-8">

      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h2>
        <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Today's journal — full width */}
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
                {todayEntry.focus && <p className="text-sm text-gray-500 truncate">{stripMarkup(todayEntry.focus)}</p>}
                <div className="mt-2">
                  <StarRating value={todayEntry.productivity_rating} readonly />
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/journal/${today}`)}>Open</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">No entry yet for today</p>
                <p className="text-xs text-gray-400 mt-0.5">Capture what you worked on, what moved forward, and what still needs attention.</p>
              </div>
              <Button size="sm" onClick={() => navigate(`/journal/${today}`)}>Start today's journal</Button>
            </div>
          )}
        </Card>
      </section>

      {/* This week stats — full width */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">This week</h3>
          <button
            onClick={() => setRecapOpen(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition font-medium"
          >
            <RiSparklingLine size={13} /> Weekly recap
          </button>
        </div>
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Completed" value={completedThisWeek} sub="tasks" />
          <StatCard label="Open" value={openTasks.length - blockedCount} sub="tasks" />
          <StatCard label="In progress" value={inProgressCount} sub="tasks" />
          <StatCard label="Blocked" value={blockedCount} sub="tasks" />
          <StatCard label="Meetings" value={meetingsThisWeek} sub="logged" />
          <StatCard label="Avg rating" value={avgRating} sub="productivity" />
        </div>
      </section>

      {/* Calendar — full width */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Calendar</h3>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />Journal</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Meetings</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Tasks</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />Completed</span>
          </div>
        </div>
        <CalendarView items={calendarItems} />
      </section>

      {/* Open tasks + Recent meetings — side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Open Tasks</h3>
            <Link to="/tasks" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
          </div>
          {openTasks.length === 0 ? (
            <Card><p className="text-sm text-gray-400 text-center py-4">No open tasks. Great work!</p></Card>
          ) : (
            <Card padding={false}>
              <ul className="divide-y divide-gray-100">
                {openTasks.map(task => {
                  const isToggling = toggling === task.id
                  return (
                    <li key={task.id} className="px-4 py-3 flex items-start gap-3 hover:bg-indigo-50/60 transition-colors">
                      <motion.button
                        onClick={() => toggleDone(task)}
                        disabled={isToggling}
                        className="mt-0.5 shrink-0 disabled:opacity-40 transition-colors"
                        aria-label="Mark complete"
                        whileTap={{ scale: 0.75 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      >
                        {isToggling
                          ? <RiCheckboxCircleLine size={18} className="text-indigo-400 animate-pulse" />
                          : <RiCircleLine size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                        }
                      </motion.button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant={statusVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
                          <Badge variant={priorityVariant(task.priority)}>{task.priority}</Badge>
                          {task.due_date && <span className="text-xs text-gray-400">Due {task.due_date}</span>}
                        </div>
                      </div>
                      <Link to={`/tasks/${task.id}`} className="text-gray-300 hover:text-indigo-400 transition shrink-0 mt-0.5">
                        <RiArrowRightSLine size={18} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Meetings</h3>
            <Link to="/transcripts" className="text-xs text-indigo-600 hover:underline font-medium">View all</Link>
          </div>
          {recentTranscripts.length === 0 ? (
            <Card><p className="text-sm text-gray-400 text-center py-4">No meeting notes yet. Paste your first meeting summary.</p></Card>
          ) : (
            <Card padding={false}>
              <ul className="divide-y divide-gray-100">
                {recentTranscripts.map(t => (
                  <li key={t.id} className="group">
                    <Link to={`/transcripts/${t.id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-indigo-50/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.meeting_title}</p>
                        {t.meeting_date && <p className="text-xs text-gray-400">{t.meeting_date}</p>}
                        {t.summary && <p className="text-xs text-gray-500 truncate mt-0.5">{t.summary}</p>}
                      </div>
                      <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>

      <WeeklyRecapModal open={recapOpen} onClose={() => setRecapOpen(false)} />
    </div>
  )
}
