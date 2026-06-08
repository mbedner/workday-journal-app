import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiCircleLine,
  RiPencilLine,
  RiBookOpenLine,
  RiFileList3Line,
  RiCheckboxLine,
  RiScalesLine,
  RiAddLine,
  RiMoreLine,
  RiLoader4Line,
  RiCheckLine,
} from '@remixicon/react'
import { format, parseISO, isToday, isPast, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Project, Task, JournalEntry, Transcript, Decision } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { StarRating } from '../components/ui/StarRating'
import { useToast } from '../contexts/ToastContext'
import { useProjects } from '../hooks/useProjects'
import { Sk, SkListCard } from '../components/ui/Skeleton'
import {
  fetchDecisions,
  createDecision,
  updateDecision,
  deleteDecision,
  backfillDecisions,
} from '../lib/decisions'

function stripMarkup(text: string): string {
  if (!text) return ''
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, onClick, badge }: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  onClick?: () => void
  badge?: React.ReactNode
}) {
  const inner = (
    <div className={`bg-white border border-gray-200 rounded-xl p-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-4 text-center sm:text-left relative ${onClick ? 'cursor-pointer hover:border-indigo-300 transition-colors' : ''}`}>
      <div className={`p-2 sm:p-2.5 rounded-lg ${color} shrink-0 relative`}>
        <Icon size={16} className="text-white sm:hidden" />
        <Icon size={18} className="text-white hidden sm:block" />
        {badge}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] sm:text-xs text-gray-500 font-medium leading-tight mt-0.5">{label}</p>
      </div>
    </div>
  )
  return onClick ? <button onClick={onClick} className="text-left w-full">{inner}</button> : inner
}

// ── Decision card ─────────────────────────────────────────────────────────────

function DecisionCard({ decision, journals, transcripts, onMenu }: {
  decision:    Decision
  journals:    JournalEntry[]
  transcripts: Transcript[]
  onMenu?:     (d: Decision, anchor: HTMLElement) => void
}) {
  const sourceLabel = (() => {
    if (decision.source_type === 'manual') return null
    if (decision.source_type === 'journal_entry') {
      const entry = journals.find(j => j.id === decision.source_id)
      const dateStr = entry?.entry_date ?? decision.source_id
      return { label: `Journal · ${format(new Date((dateStr ?? '') + 'T12:00:00'), 'MMM d, yyyy')}`, url: `/journal/${dateStr}` }
    }
    const t = transcripts.find(x => x.id === decision.source_id)
    return { label: t?.meeting_title ?? 'Meeting note', url: `/transcripts/${decision.source_id}` }
  })()

  const isSuperseded = decision.status === 'superseded'

  return (
    <div className={`px-4 py-3.5 ${isSuperseded ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm text-gray-800 leading-snug flex-1 ${isSuperseded ? 'line-through text-gray-400' : ''}`}>
          {decision.content}
        </p>
        {onMenu && (
          <button
            onClick={e => onMenu(decision, e.currentTarget)}
            className="shrink-0 p-1 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <RiMoreLine size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        <span className="text-xs text-gray-400">{format(new Date(decision.date + 'T12:00:00'), 'MMM d, yyyy')}</span>

        {sourceLabel && (
          <Link to={sourceLabel.url} className="text-xs text-indigo-500 hover:underline">
            From: {sourceLabel.label}
          </Link>
        )}

        {isSuperseded && <Badge variant="gray">Superseded</Badge>}

        {decision.people.map(p => (
          <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Review modal ──────────────────────────────────────────────────────────────

function ReviewModal({ decisions, journals, transcripts, onClose, onRefresh }: {
  decisions:   Decision[]
  journals:    JournalEntry[]
  transcripts: Transcript[]
  onClose:     () => void
  onRefresh:   () => void
}) {
  const { addToast } = useToast()
  const [index,   setIndex]   = useState(0)
  const [editing, setEditing] = useState(false)
  const [text,    setText]    = useState('')
  const [busy,    setBusy]    = useState(false)

  const current = decisions[index]

  const advance = () => {
    if (index + 1 >= decisions.length) { onRefresh(); onClose() }
    else { setIndex(i => i + 1); setEditing(false) }
  }

  const confirm = async () => {
    if (!current) return
    setBusy(true)
    try {
      await updateDecision(current.id, { status: 'active', ...(editing && text.trim() ? { content: text.trim() } : {}) })
      advance()
    } catch { addToast('Failed to confirm', 'error') }
    finally { setBusy(false) }
  }

  const dismiss = async () => {
    if (!current) return
    setBusy(true)
    try { await updateDecision(current.id, { status: 'dismissed' }); advance() }
    catch { addToast('Failed to dismiss', 'error') }
    finally { setBusy(false) }
  }

  if (!current) return null

  const sourceLabel = (() => {
    if (current.source_type === 'journal_entry') {
      const entry = journals.find(j => j.id === current.source_id)
      return `Journal · ${format(new Date((entry?.entry_date ?? current.date) + 'T12:00:00'), 'MMM d, yyyy')}`
    }
    const t = transcripts.find(x => x.id === current.source_id)
    return t?.meeting_title ?? 'Meeting note'
  })()

  const confidenceColor = current.confidence === 'high' ? 'text-green-600' : current.confidence === 'medium' ? 'text-amber-600' : 'text-red-500'

  return (
    <Modal open onClose={onClose} title={`Review decisions (${index + 1} of ${decisions.length})`}>
      <div className="space-y-4">
        {/* Decision text */}
        {editing ? (
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            autoFocus
            className="w-full"
          />
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">
            {current.content}
          </p>
        )}

        {/* Meta */}
        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-600">Source:</span>
            <span>{sourceLabel}</span>
            <span>·</span>
            <span>{format(new Date(current.date + 'T12:00:00'), 'MMM d, yyyy')}</span>
          </div>
          {current.excerpt && (
            <p className="italic text-gray-400 border-l-2 border-gray-200 pl-2 leading-relaxed">
              "{current.excerpt}"
            </p>
          )}
          {current.confidence && (
            <p>AI confidence: <span className={`font-medium ${confidenceColor}`}>{current.confidence}</span></p>
          )}
          {current.people.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-0.5">
              {current.people.map(p => (
                <span key={p} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {editing ? (
            <>
              <Button onClick={confirm} loading={busy} disabled={!text.trim()}>
                <RiCheckLine size={14} /> Confirm edit
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel edit</Button>
            </>
          ) : (
            <>
              <Button onClick={confirm} loading={busy}>
                <RiCheckLine size={14} /> Confirm
              </Button>
              <Button variant="secondary" onClick={() => { setEditing(true); setText(current.content) }}>
                Edit &amp; Confirm
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={dismiss} loading={busy}>Dismiss</Button>
          <button onClick={onClose} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
            Review later
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add decision modal ────────────────────────────────────────────────────────

function AddDecisionModal({ projectId, userId, onClose, onSaved }: {
  projectId: string
  userId:    string
  onClose:   () => void
  onSaved:   (d: Decision) => void
}) {
  const { addToast } = useToast()
  const [content, setContent] = useState('')
  const [date,    setDate]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [people,  setPeople]  = useState('')
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const save = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const d = await createDecision({
        project_id: projectId,
        user_id:    userId,
        content:    content.trim(),
        date,
        people:     people.split(',').map(s => s.trim()).filter(Boolean),
        notes:      notes || undefined,
      })
      onSaved(d)
      onClose()
      addToast('Decision added', 'success')
    } catch (e: any) {
      addToast(e.message ?? 'Failed to add decision', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add decision">
      <div className="space-y-4">
        <Textarea
          label="Decision"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder='e.g. The MVP will not replace the existing search experience'
          rows={3}
          autoFocus
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          max={format(new Date(), 'yyyy-MM-dd')}
        />
        <Input
          label="People (optional)"
          value={people}
          onChange={e => setPeople(e.target.value)}
          placeholder="Alice Smith, Bob Jones"
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Context about why this was decided"
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!content.trim()}>Add decision</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { update } = useProjects()

  const [project,     setProject]     = useState<Project | null>(null)
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [journals,    setJournals]    = useState<JournalEntry[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [decisions,   setDecisions]   = useState<Decision[]>([])
  const [loading,     setLoading]     = useState(true)
  const [toggling,    setToggling]    = useState<string | null>(null)
  const [userId,      setUserId]      = useState<string>('')

  // Backfill
  const [backfilling, setBackfilling] = useState(false)

  // Edit project modal
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving,   setSaving]   = useState(false)

  // Decision UI
  const [reviewOpen,    setReviewOpen]    = useState(false)
  const [addOpen,       setAddOpen]       = useState(false)
  const [menuDecision,  setMenuDecision]  = useState<Decision | null>(null)
  const [menuAnchor,    setMenuAnchor]    = useState<{ top: number; left: number } | null>(null)

  const decisionsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })

    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('task_projects').select('task_id').eq('project_id', id),
      supabase.from('journal_entry_projects').select('journal_entry_id').eq('project_id', id),
      supabase.from('transcript_projects').select('transcript_id').eq('project_id', id),
    ]).then(async ([{ data: proj }, { data: tp }, { data: jp }, { data: xp }]) => {
      if (!proj) { navigate('/projects'); return }
      setProject(proj)

      const taskIds       = (tp ?? []).map((r: any) => r.task_id)
      const journalIds    = (jp ?? []).map((r: any) => r.journal_entry_id)
      const transcriptIds = (xp ?? []).map((r: any) => r.transcript_id)

      const [taskRes, journalRes, transcriptRes] = await Promise.all([
        taskIds.length
          ? supabase.from('tasks').select('*').in('id', taskIds).is('archived_at', null).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        journalIds.length
          ? supabase.from('journal_entries').select('*').in('id', journalIds).is('archived_at', null).order('entry_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        transcriptIds.length
          ? supabase.from('transcripts').select('*').in('id', transcriptIds).is('archived_at', null).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])

      setTasks((taskRes.data ?? []) as Task[])
      setJournals((journalRes.data ?? []) as JournalEntry[])
      setTranscripts((transcriptRes.data ?? []) as Transcript[])
      setLoading(false)
    })
  }, [id, navigate])

  // Load decisions separately (don't block main load)
  useEffect(() => {
    if (!id) return
    fetchDecisions(id, undefined, 100)
      .then(setDecisions)
      .catch(() => { /* silent */ })
  }, [id])

  const reloadDecisions = () => {
    if (!id) return
    fetchDecisions(id, undefined, 100).then(setDecisions).catch(() => {})
  }

  const toggleDone = async (task: Task) => {
    setToggling(task.id)
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    const patch = { status: newStatus, updated_at: new Date().toISOString(), completed_at: newStatus === 'done' ? new Date().toISOString() : null }
    await supabase.from('tasks').update(patch).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } as Task : t))
    setToggling(null)
  }

  const openEdit = () => {
    if (!project) return
    setEditName(project.name)
    setEditDesc(project.description ?? '')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!project || !editName.trim()) return
    setSaving(true)
    try {
      await update(project.id, editName.trim(), editDesc || undefined)
      setProject(p => p ? { ...p, name: editName.trim(), description: editDesc || null } : p)
      setEditOpen(false)
      addToast('Project updated', 'success')
    } catch {
      addToast('Failed to update project', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleBackfill = async () => {
    if (!id || !userId) return
    setBackfilling(true)
    try {
      const { extracted } = await backfillDecisions(id, userId)
      addToast(`Backfill complete · ${extracted} decision${extracted !== 1 ? 's' : ''} extracted`, 'success')
      reloadDecisions()
    } catch (e: any) {
      addToast(e.message ?? 'Backfill failed', 'error')
    } finally {
      setBackfilling(false)
    }
  }

  const handleMenuAction = async (action: string) => {
    if (!menuDecision) return
    setMenuAnchor(null)
    try {
      if (action === 'edit') {
        const text = window.prompt('Edit decision:', menuDecision.content)
        if (text && text.trim()) {
          const updated = await updateDecision(menuDecision.id, { content: text.trim() })
          setDecisions(prev => prev.map(d => d.id === updated.id ? updated : d))
        }
      } else if (action === 'supersede') {
        await updateDecision(menuDecision.id, { status: 'superseded' })
        reloadDecisions()
      } else if (action === 'dismiss') {
        await updateDecision(menuDecision.id, { status: 'dismissed' })
        setDecisions(prev => prev.filter(d => d.id !== menuDecision.id))
      } else if (action === 'delete') {
        if (!window.confirm('Delete this decision?')) return
        await deleteDecision(menuDecision.id)
        setDecisions(prev => prev.filter(d => d.id !== menuDecision.id))
        addToast('Decision deleted', 'success')
      }
    } catch (e: any) {
      addToast(e.message ?? 'Action failed', 'error')
    }
    setMenuDecision(null)
  }

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-2.5 w-24" />
        <Sk className="h-8 w-56" />
        <Sk className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-4">
            <Sk className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg shrink-0" />
            <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0 flex flex-col items-center sm:items-start">
              <Sk className="h-6 w-6" />
              <Sk className="h-2 w-10 max-w-full sm:w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-3"><Sk className="h-2.5 w-16" /><SkListCard rows={3} /></div>
        <div className="space-y-3"><Sk className="h-2.5 w-28" /><SkListCard rows={3} /></div>
      </div>
    </div>
  )
  if (!project) return null

  const twoWeeksAgo = subDays(new Date(), 14).toISOString().slice(0, 10)
  const projectParam = encodeURIComponent(project.name)

  const openTasks  = tasks.filter(t => t.status !== 'done')
  const doneTasks  = tasks.filter(t => t.status === 'done')

  const recentTasks = [
    ...openTasks,
    ...doneTasks.filter(t => (t.updated_at ?? t.created_at).slice(0, 10) >= twoWeeksAgo),
  ].slice(0, 5)
  const recentJournals    = journals.filter(e => e.entry_date >= twoWeeksAgo).slice(0, 5)
  const recentTranscripts = transcripts.filter(t =>
    ((t.meeting_date ?? t.created_at)).slice(0, 10) >= twoWeeksAgo
  ).slice(0, 5)

  const activeDecisions  = decisions.filter(d => d.status === 'active')
  const pendingDecisions = decisions.filter(d => d.status === 'pending_review')
  const recentDecisions  = activeDecisions.slice(0, 5)

  const hasPending = pendingDecisions.length > 0

  return (
    <div className="space-y-8" onClick={() => { if (menuAnchor) { setMenuAnchor(null); setMenuDecision(null) } }}>
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-2"
        >
          <RiArrowLeftLine size={13} /> All projects
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={openEdit}>
            <RiPencilLine size={14} className="mr-1" /> Edit project
          </Button>
        </div>
      </div>

      {/* Stats — 4 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tasks"          value={tasks.length}      icon={RiCheckboxLine} color="bg-indigo-500" />
        <StatCard label="Journal entries" value={journals.length}   icon={RiBookOpenLine} color="bg-violet-500" />
        <StatCard label="Meeting notes"  value={transcripts.length} icon={RiFileList3Line} color="bg-blue-500" />
        <StatCard
          label="Decisions"
          value={activeDecisions.length}
          icon={RiScalesLine}
          color="bg-amber-500"
          onClick={() => decisionsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          badge={hasPending
            ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" />
            : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Tasks
              {openTasks.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400 normal-case">{openTasks.length} open</span>}
            </h2>
            <Link to={`/tasks?project=${projectParam}`} className="text-xs text-indigo-600 hover:underline font-medium">View all tasks</Link>
          </div>

          {tasks.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No tasks linked to this project yet.</p>
              <p className="text-xs text-gray-400 mt-1">Add a task and associate it with <strong>{project.name}</strong>.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {recentTasks.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-gray-400">No activity in the last 14 days.</p>
                  <Link to={`/tasks?project=${projectParam}`} className="text-xs text-indigo-500 hover:underline mt-1 inline-block">View all tasks</Link>
                </div>
              ) : recentTasks.map(task => {
                const isDone      = task.status === 'done'
                const isToggling_ = toggling === task.id
                const isOverdue   = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                return (
                  <div key={task.id} className={`flex items-start gap-3 px-4 py-3 group transition-colors ${isDone ? 'bg-gray-50/50' : 'hover:bg-indigo-50/60'}`}>
                    <button onClick={() => toggleDone(task)} disabled={isToggling_} className="mt-0.5 shrink-0 disabled:opacity-40 transition-colors">
                      {isDone
                        ? <RiCheckboxCircleLine size={18} className="text-indigo-500" />
                        : <RiCircleLine size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                      <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                        {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                        {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                        <Badge variant={{ high: 'red', medium: 'yellow', low: 'gray' }[task.priority] as 'red' | 'yellow' | 'gray'}>
                          {task.priority}
                        </Badge>
                        {task.due_date && (
                          <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                            {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Journal entries */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Journal Entries</h2>
            <Link to={`/journal?project=${projectParam}`} className="text-xs text-indigo-600 hover:underline font-medium">View all entries</Link>
          </div>

          {journals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No journal entries linked to this project yet.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {recentJournals.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-gray-400">No entries in the last 14 days.</p>
                  <Link to={`/journal?project=${projectParam}`} className="text-xs text-indigo-500 hover:underline mt-1 inline-block">View all entries</Link>
                </div>
              ) : recentJournals.map(entry => (
                <Link key={entry.id} to={`/journal/${entry.entry_date}`} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                      {entry.entry_date === format(new Date(), 'yyyy-MM-dd') && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
                      )}
                    </p>
                    {entry.focus && <p className="text-xs text-gray-500 truncate mt-0.5">{stripMarkup(entry.focus)}</p>}
                    {entry.productivity_rating && <div className="mt-1"><StarRating value={entry.productivity_rating} readonly /></div>}
                  </div>
                  <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Meeting Notes */}
      {transcripts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Meeting Notes</h2>
            <Link to={`/transcripts?project=${projectParam}`} className="text-xs text-indigo-600 hover:underline font-medium">View all notes</Link>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {recentTranscripts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-400">No meeting notes in the last 14 days.</p>
                <Link to={`/transcripts?project=${projectParam}`} className="text-xs text-indigo-500 hover:underline mt-1 inline-block">View all notes</Link>
              </div>
            ) : recentTranscripts.map(t => (
              <Link key={t.id} to={`/transcripts/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.meeting_title}</p>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    {t.meeting_date && <span>{t.meeting_date}</span>}
                    {t.attendees && <span className="truncate">{t.attendees}</span>}
                  </div>
                  {(t.raw_transcript ?? t.summary) && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{stripMarkup(t.raw_transcript ?? t.summary ?? '')}</p>
                  )}
                </div>
                <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Decisions */}
      <section ref={decisionsRef}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Decisions</h2>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <RiAddLine size={14} /> Add
            </Button>
            <Link to={`/projects/${id}/decisions`} className="text-xs text-indigo-600 hover:underline font-medium">
              View all
            </Link>
          </div>
        </div>

        {/* Pending review banner */}
        {hasPending && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              {pendingDecisions.length} extracted decision{pendingDecisions.length !== 1 ? 's' : ''} need{pendingDecisions.length === 1 ? 's' : ''} your review.
            </p>
            <button
              onClick={() => setReviewOpen(true)}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
            >
              Review now
            </button>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {activeDecisions.length === 0 ? (
            <div className="px-4 py-8 text-center space-y-3">
              <p className="text-sm text-gray-400">
                No decisions recorded for this project yet. Decisions are extracted automatically from your journal entries and meeting notes, or you can add one manually.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
                  <RiAddLine size={14} /> Add manually
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBackfill}
                  disabled={backfilling}
                  title="Scan all existing journal entries and meeting notes for decisions"
                >
                  {backfilling ? <><RiLoader4Line size={14} className="animate-spin" /> Scanning…</> : 'Scan existing entries'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentDecisions.map(d => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  journals={journals}
                  transcripts={transcripts}
                  onMenu={(dec, anchor) => {
                    const rect = anchor.getBoundingClientRect()
                    setMenuDecision(dec)
                    setMenuAnchor({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX - 120 })
                  }}
                />
              ))}
              {activeDecisions.length > 5 && (
                <div className="px-4 py-3 text-center">
                  <Link to={`/projects/${id}/decisions`} className="text-xs text-indigo-600 hover:underline">
                    View all {activeDecisions.length} decisions
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backfill button when decisions exist */}
        {activeDecisions.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50"
            >
              {backfilling ? <RiLoader4Line size={12} className="animate-spin" /> : null}
              {backfilling ? 'Scanning…' : 'Scan existing entries for decisions'}
            </button>
          </div>
        )}
      </section>

      {/* Context menu */}
      {menuAnchor && menuDecision && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { key: 'edit',      label: 'Edit' },
            { key: 'supersede', label: 'Mark as superseded' },
            { key: 'dismiss',   label: 'Dismiss' },
            ...(menuDecision.source_type === 'manual' || menuDecision.status === 'dismissed'
              ? [{ key: 'delete', label: 'Delete' }] : []),
          ].map(item => (
            <button
              key={item.key}
              onClick={() => handleMenuAction(item.key)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${item.key === 'delete' ? 'text-red-600' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Edit project modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit project">
        <div className="space-y-4">
          <Input label="Name" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Project name" autoFocus />
          <Textarea label="Description" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What is this project about?" rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} loading={saving} disabled={!editName.trim()}>Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* Review modal */}
      {reviewOpen && (
        <ReviewModal
          decisions={pendingDecisions}
          journals={journals}
          transcripts={transcripts}
          onClose={() => setReviewOpen(false)}
          onRefresh={reloadDecisions}
        />
      )}

      {/* Add decision modal */}
      {addOpen && userId && (
        <AddDecisionModal
          projectId={id!}
          userId={userId}
          onClose={() => setAddOpen(false)}
          onSaved={d => setDecisions(prev => [d, ...prev])}
        />
      )}
    </div>
  )
}
