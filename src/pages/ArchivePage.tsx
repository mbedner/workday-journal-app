import { useEffect, useState } from 'react'
import { RiArchiveLine, RiDeleteBinLine, RiArrowGoBackLine } from '@remixicon/react'
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Task, JournalEntry, Transcript, Project } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../contexts/ToastContext'
import { Sk } from '../components/ui/Skeleton'

const ARCHIVE_DAYS = 90

function daysLeft(archivedAt: string): number {
  return ARCHIVE_DAYS - differenceInDays(new Date(), parseISO(archivedAt))
}

function ExpiryBadge({ archivedAt }: { archivedAt: string }) {
  const days = daysLeft(archivedAt)
  if (days <= 7) return <span className="text-xs text-red-500 font-medium">Expires in {days}d</span>
  if (days <= 30) return <span className="text-xs text-amber-500 font-medium">Expires in {days}d</span>
  return <span className="text-xs text-gray-400">Expires in {days}d</span>
}

interface SectionProps {
  title: string
  count: number
  children: React.ReactNode
}

function Section({ title, count, children }: SectionProps) {
  if (count === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        {title}
        <span className="ml-2 text-xs font-normal text-gray-400 normal-case">{count}</span>
      </h2>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </section>
  )
}

export function ArchivePage() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const load = async () => {
    setLoading(true)

    // Purge items past the 90-day window first
    const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await Promise.all([
      supabase.from('tasks').delete().not('archived_at', 'is', null).lt('archived_at', cutoff),
      supabase.from('journal_entries').delete().not('archived_at', 'is', null).lt('archived_at', cutoff),
      supabase.from('transcripts').delete().not('archived_at', 'is', null).lt('archived_at', cutoff),
      supabase.from('projects').delete().not('archived_at', 'is', null).lt('archived_at', cutoff),
    ])

    const [{ data: t }, { data: j }, { data: tr }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
      supabase.from('journal_entries').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
      supabase.from('transcripts').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
      supabase.from('projects').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    ])

    setTasks((t ?? []) as Task[])
    setJournals((j ?? []) as JournalEntry[])
    setTranscripts((tr ?? []) as Transcript[])
    setProjects((p ?? []) as Project[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Generic restore
  const restore = async (table: string, id: string, label: string) => {
    await supabase.from(table).update({ archived_at: null }).eq('id', id)
    addToast(`${label} restored`, 'success')
    load()
  }

  // Generic permanent delete
  const purge = async (table: string, id: string, label: string) => {
    await supabase.from(table).delete().eq('id', id)
    addToast(`${label} permanently deleted`, 'info')
    load()
  }

  const total = tasks.length + journals.length + transcripts.length + projects.length

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-1.5">
        <Sk className="h-7 w-32" />
        <Sk className="h-4 w-56" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <Sk className="h-2.5 w-20" />
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 space-y-2">
                  <Sk className="h-3.5 w-48" />
                  <Sk className="h-2.5 w-32" />
                </div>
                <Sk className="h-7 w-16 rounded-lg" />
                <Sk className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Archive</h1>
        <p className="text-sm text-gray-500">
          {total === 0
            ? 'Nothing archived yet.'
            : `${total} archived item${total !== 1 ? 's' : ''} — automatically purged after ${ARCHIVE_DAYS} days.`}
        </p>
      </div>

      {total === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <RiArchiveLine size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">Archive is empty</p>
          <p className="text-xs text-gray-400 mt-1">Items you archive will appear here and be permanently deleted after {ARCHIVE_DAYS} days.</p>
        </div>
      )}

      {/* Tasks */}
      <Section title="Tasks" count={tasks.length}>
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{t.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">
                  Archived {formatDistanceToNow(parseISO(t.archived_at!), { addSuffix: true })}
                </span>
                <span className="text-gray-200">·</span>
                <ExpiryBadge archivedAt={t.archived_at!} />
                <Badge variant={{ high: 'red', medium: 'yellow', low: 'gray' }[t.priority] as 'red' | 'yellow' | 'gray'}>
                  {t.priority}
                </Badge>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => restore('tasks', t.id, 'Task')}>
              <RiArrowGoBackLine size={13} className="mr-1" /> Restore
            </Button>
            <Button variant="danger" size="sm" onClick={() => purge('tasks', t.id, 'Task')}>
              <RiDeleteBinLine size={13} className="mr-1" /> Delete
            </Button>
          </div>
        ))}
      </Section>

      {/* Journal Entries */}
      <Section title="Journal Entries" count={journals.length}>
        {journals.map(j => (
          <div key={j.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">
                {j.entry_date}
                {j.focus && <span className="text-gray-400 font-normal ml-2 text-xs">— {j.focus.replace(/<[^>]+>/g, '').slice(0, 60)}</span>}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">
                  Archived {formatDistanceToNow(parseISO(j.archived_at!), { addSuffix: true })}
                </span>
                <span className="text-gray-200">·</span>
                <ExpiryBadge archivedAt={j.archived_at!} />
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => restore('journal_entries', j.id, 'Entry')}>
              <RiArrowGoBackLine size={13} className="mr-1" /> Restore
            </Button>
            <Button variant="danger" size="sm" onClick={() => purge('journal_entries', j.id, 'Entry')}>
              <RiDeleteBinLine size={13} className="mr-1" /> Delete
            </Button>
          </div>
        ))}
      </Section>

      {/* Meeting Notes */}
      <Section title="Meeting Notes" count={transcripts.length}>
        {transcripts.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{t.meeting_title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {t.meeting_date && <span className="text-xs text-gray-400">{t.meeting_date} ·</span>}
                <span className="text-xs text-gray-400">
                  Archived {formatDistanceToNow(parseISO(t.archived_at!), { addSuffix: true })}
                </span>
                <span className="text-gray-200">·</span>
                <ExpiryBadge archivedAt={t.archived_at!} />
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => restore('transcripts', t.id, 'Meeting note')}>
              <RiArrowGoBackLine size={13} className="mr-1" /> Restore
            </Button>
            <Button variant="danger" size="sm" onClick={() => purge('transcripts', t.id, 'Meeting note')}>
              <RiDeleteBinLine size={13} className="mr-1" /> Delete
            </Button>
          </div>
        ))}
      </Section>

      {/* Projects */}
      <Section title="Projects" count={projects.length}>
        {projects.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">
                  Archived {formatDistanceToNow(parseISO(p.archived_at!), { addSuffix: true })}
                </span>
                <span className="text-gray-200">·</span>
                <ExpiryBadge archivedAt={p.archived_at!} />
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => restore('projects', p.id, 'Project')}>
              <RiArrowGoBackLine size={13} className="mr-1" /> Restore
            </Button>
            <Button variant="danger" size="sm" onClick={() => purge('projects', p.id, 'Project')}>
              <RiDeleteBinLine size={13} className="mr-1" /> Delete
            </Button>
          </div>
        ))}
      </Section>
    </div>
  )
}
