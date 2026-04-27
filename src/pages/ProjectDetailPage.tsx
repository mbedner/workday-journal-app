import { useEffect, useState } from 'react'
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
} from '@remixicon/react'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Project, Task, JournalEntry, Transcript } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { StarRating } from '../components/ui/StarRating'
import { useToast } from '../contexts/ToastContext'
import { useProjects } from '../hooks/useProjects'
import { Sk, SkListCard } from '../components/ui/Skeleton'

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

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
    </div>
  )
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { update } = useProjects()

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('task_projects').select('task_id').eq('project_id', id),
      supabase.from('journal_entry_projects').select('journal_entry_id').eq('project_id', id),
      supabase.from('transcript_projects').select('transcript_id').eq('project_id', id),
    ]).then(async ([{ data: proj }, { data: tp }, { data: jp }, { data: xp }]) => {
      if (!proj) { navigate('/projects'); return }
      setProject(proj)

      const taskIds = (tp ?? []).map((r: any) => r.task_id)
      const journalIds = (jp ?? []).map((r: any) => r.journal_entry_id)
      const transcriptIds = (xp ?? []).map((r: any) => r.transcript_id)

      const [taskRes, journalRes, transcriptRes] = await Promise.all([
        taskIds.length ? supabase.from('tasks').select('*').in('id', taskIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
        journalIds.length ? supabase.from('journal_entries').select('*').in('id', journalIds).order('entry_date', { ascending: false }) : Promise.resolve({ data: [] }),
        transcriptIds.length ? supabase.from('transcripts').select('*').in('id', transcriptIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      ])

      setTasks((taskRes.data ?? []) as Task[])
      setJournals((journalRes.data ?? []) as JournalEntry[])
      setTranscripts((transcriptRes.data ?? []) as Transcript[])
      setLoading(false)
    })
  }, [id, navigate])

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

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-2.5 w-24" />
        <Sk className="h-8 w-56" />
        <Sk className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4">
            <Sk className="h-10 w-10 rounded-lg shrink-0" />
            <div className="space-y-2 flex-1">
              <Sk className="h-6 w-8" />
              <Sk className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Sk className="h-2.5 w-16" />
          <SkListCard rows={3} />
        </div>
        <div className="space-y-3">
          <Sk className="h-2.5 w-28" />
          <SkListCard rows={3} />
        </div>
      </div>
    </div>
  )
  if (!project) return null

  const openTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div className="space-y-8">
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tasks" value={tasks.length} icon={RiCheckboxLine} color="bg-indigo-500" />
        <StatCard label="Journal entries" value={journals.length} icon={RiBookOpenLine} color="bg-violet-500" />
        <StatCard label="Meeting notes" value={transcripts.length} icon={RiFileList3Line} color="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Tasks
              {openTasks.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400 normal-case">{openTasks.length} open</span>}
            </h2>
            <Link to="/tasks" className="text-xs text-indigo-600 hover:underline font-medium">View all tasks</Link>
          </div>

          {tasks.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No tasks linked to this project yet.</p>
              <p className="text-xs text-gray-400 mt-1">Add a task and associate it with <strong>{project.name}</strong>.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {[...openTasks, ...doneTasks].map(task => {
                const isDone = task.status === 'done'
                const isToggling = toggling === task.id
                const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 px-4 py-3 group transition-colors ${isDone ? 'bg-gray-50/50' : 'hover:bg-indigo-50/60'}`}
                  >
                    <button
                      onClick={() => toggleDone(task)}
                      disabled={isToggling}
                      className="mt-0.5 shrink-0 disabled:opacity-40 transition-colors"
                    >
                      {isDone
                        ? <RiCheckboxCircleLine size={18} className="text-indigo-500" />
                        : <RiCircleLine size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </p>
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
            <Link to="/journal" className="text-xs text-indigo-600 hover:underline font-medium">View all entries</Link>
          </div>

          {journals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No journal entries linked to this project yet.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {journals.map(entry => (
                <Link
                  key={entry.id}
                  to={`/journal/${entry.entry_date}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                      {entry.entry_date === format(new Date(), 'yyyy-MM-dd') && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Today</span>
                      )}
                    </p>
                    {entry.focus && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{stripMarkup(entry.focus)}</p>
                    )}
                    {entry.productivity_rating && (
                      <div className="mt-1">
                        <StarRating value={entry.productivity_rating} readonly />
                      </div>
                    )}
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
            <Link to="/transcripts" className="text-xs text-indigo-600 hover:underline font-medium">View all notes</Link>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {transcripts.map(t => (
              <Link
                key={t.id}
                to={`/transcripts/${t.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.meeting_title}</p>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    {t.meeting_date && <span>{t.meeting_date}</span>}
                    {t.attendees && <span className="truncate">{t.attendees}</span>}
                  </div>
                  {(t.raw_transcript ?? t.summary) && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {stripMarkup(t.raw_transcript ?? t.summary ?? '')}
                    </p>
                  )}
                </div>
                <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Edit modal */}
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
    </div>
  )
}
