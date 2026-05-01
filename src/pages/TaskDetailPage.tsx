import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPencilLine, RiCheckboxCircleLine,
  RiCircleLine, RiCloseLine, RiAddLine,
} from '@remixicon/react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Task, Subtask } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { RichTextEditor } from '../components/ui/RichTextEditor'
import { MarkdownContent } from '../components/ui/MarkdownContent'
import { TagInput } from '../components/ui/TagInput'
import { Sk } from '../components/ui/Skeleton'
import { ProjectTag } from '../components/ui/ProjectTag'
import { useToast } from '../contexts/ToastContext'
import { useProjects } from '../hooks/useProjects'
import { motion } from 'framer-motion'

type Status   = Task['status']
type Priority = Task['priority']

const statusVariants: Record<Status, 'yellow' | 'blue' | 'green' | 'red'> = {
  todo: 'yellow', in_progress: 'blue', done: 'green', blocked: 'red',
}
const priorityVariants: Record<Priority, 'red' | 'yellow' | 'gray'> = {
  high: 'red', medium: 'yellow', low: 'gray',
}


export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { projects: allProjects, create: createProject } = useProjects()
  const nameToId = useMemo(
    () => Object.fromEntries(allProjects.map(p => [p.name, p.id])),
    [allProjects]
  )

  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [toggling, setToggling] = useState(false)

  // Task fields
  const [task, setTask]                   = useState<Task | null>(null)
  const [title, setTitle]                 = useState('')
  const [notes, setNotes]                 = useState('')
  const [status, setStatus]               = useState<Status>('todo')
  const [priority, setPriority]           = useState<Priority>('medium')
  const [dueDate, setDueDate]             = useState('')
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])

  // Subtasks
  const [subtasks, setSubtasks]           = useState<Subtask[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [subtaskAdding, setSubtaskAdding] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('subtasks').select('*').eq('task_id', id).order('position'),
      supabase.from('task_projects').select('project_id, projects(name)').eq('task_id', id),
    ]).then(([{ data: t }, { data: subs }, { data: tp }]) => {
      if (!t) { navigate('/tasks'); return }
      setTask(t)
      setTitle(t.title)
      setNotes(t.notes ?? '')
      setStatus(t.status)
      setPriority(t.priority)
      setDueDate(t.due_date ?? '')
      setSubtasks(subs ?? [])
      setSelectedProjects((tp ?? []).map((r: any) => r.projects?.name).filter(Boolean))
      setLoading(false)
    })
  }, [id, navigate])

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const isNowDone = status === 'done'
      await supabase.from('tasks').update({
        title: title.trim() || task.title,
        notes: notes || null,
        status,
        priority,
        due_date: dueDate || null,
        completed_at: isNowDone ? (task.completed_at ?? new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id)

      // Sync projects
      await supabase.from('task_projects').delete().eq('task_id', task.id)
      if (selectedProjects.length) {
        const projectIds = await Promise.all(
          selectedProjects.map(async name => {
            let proj = allProjects.find(p => p.name === name)
            if (!proj) { const { data } = await createProject(name); proj = data }
            return proj?.id
          })
        )
        const rows = projectIds.filter(Boolean).map(pid => ({ user_id: user!.id, task_id: task.id, project_id: pid }))
        if (rows.length) await supabase.from('task_projects').insert(rows)
      }

      setTask(prev => prev ? { ...prev, title: title.trim(), notes: notes || null, status, priority, due_date: dueDate || null } : prev)
      addToast('Task saved', 'success')
      setIsEditing(false)
    } catch {
      addToast('Failed to save task', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleDone = async () => {
    if (!task) return
    setToggling(true)
    const newStatus: Status = task.status === 'done' ? 'todo' : 'done'
    const patch = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
    }
    await supabase.from('tasks').update(patch).eq('id', task.id)
    setTask(prev => prev ? { ...prev, ...patch } : prev)
    setStatus(newStatus)
    setToggling(false)
  }

  const toggleSubtask = async (sub: Subtask) => {
    const updated = { ...sub, completed: !sub.completed }
    await supabase.from('subtasks').update({ completed: updated.completed }).eq('id', sub.id)
    setSubtasks(prev => prev.map(s => s.id === sub.id ? updated : s))
  }

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return
    setSubtaskAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('subtasks').insert({
      task_id: task.id, user_id: user!.id,
      title: newSubtaskTitle.trim(), completed: false, position: subtasks.length,
    }).select().single()
    if (data) setSubtasks(prev => [...prev, data as Subtask])
    setNewSubtaskTitle('')
    setSubtaskAdding(false)
  }

  const deleteSubtask = async (sub: Subtask) => {
    await supabase.from('subtasks').delete().eq('id', sub.id)
    setSubtasks(prev => prev.filter(s => s.id !== sub.id))
  }

  const handleDelete = async () => {
    await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', id!)
    navigate('/tasks')
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
      {/* Back nav + action buttons */}
      <div className="flex items-center justify-between gap-4">
        <Sk className="h-3 w-20" />
        <div className="flex gap-2">
          <Sk className="h-9 w-28 rounded-lg" />
          <Sk className="h-9 w-16 rounded-lg" />
          <Sk className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      {/* Title + meta badges */}
      <div className="space-y-3">
        <Sk className="h-8 w-3/4" />
        <div className="flex items-center gap-2 flex-wrap">
          <Sk className="h-5 w-16 rounded-full" />
          <Sk className="h-5 w-16 rounded-full" />
          <Sk className="h-5 w-24 rounded-full" />
        </div>
      </div>
      {/* Notes */}
      <div className="space-y-2">
        <Sk className="h-2.5 w-10" />
        <div className="space-y-1.5">
          {[...Array(4)].map((_, i) => (
            <Sk key={i} className={`h-3 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
      {/* Subtasks */}
      <div className="space-y-3">
        <Sk className="h-2.5 w-16" />
        <Sk className="h-1.5 w-full rounded-full" />
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Sk className="h-4 w-4 rounded-full shrink-0" />
              <Sk className={`h-3 ${i === 1 ? 'w-1/2' : 'w-2/3'}`} />
            </div>
          ))}
        </div>
      </div>
      {/* Projects */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        <Sk className="h-2.5 w-12" />
        <div className="flex gap-2">
          <Sk className="h-5 w-20 rounded-full" />
          <Sk className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  )

  if (!task) return null

  const isDone    = task.status === 'done'
  const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
  const completedSubs = subtasks.filter(s => s.completed).length

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (isEditing) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate('/tasks')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition">
          <RiArrowLeftLine size={13} /> All tasks
        </button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>Archive</Button>
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>

      <div className="space-y-4">
        <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <RichTextEditor label="Notes" value={notes} onChange={setNotes} placeholder="Notes, links, context..." minHeight={120} />
        <TagInput
          label="Projects"
          values={selectedProjects}
          suggestions={allProjects.map(p => p.name)}
          onChange={setSelectedProjects}
          placeholder="Add project..."
        />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={status} onChange={e => setStatus(e.target.value as Status)}>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </Select>
          <Select label="Priority" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <Input label="Due date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />

        {/* Subtasks */}
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Subtasks</p>
          {subtasks.length > 0 && (
            <div className="space-y-1 mb-3">
              {subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 group/sub py-0.5">
                  <button type="button" onClick={() => toggleSubtask(sub)} className="shrink-0">
                    {sub.completed
                      ? <RiCheckboxCircleLine size={16} className="text-indigo-500" />
                      : <RiCircleLine size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                    }
                  </button>
                  <span className={`text-sm flex-1 leading-snug ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {sub.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteSubtask(sub)}
                    className="opacity-0 group-hover/sub:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-red-500 rounded"
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Input
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                placeholder="Add a subtask..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
              />
            </div>
            <Button type="button" variant="secondary" onClick={addSubtask} loading={subtaskAdding} disabled={!newSubtaskTitle.trim()}>
              <RiAddLine size={14} />
            </Button>
          </div>
        </div>
      </div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Archive task?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This task will be archived and permanently deleted after 90 days.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Archive</Button>
          </div>
        </div>
      </Modal>
    </div>
  )

  // ── View mode ────────────────────────────────────────────────────────────
  const subtaskPct = subtasks.length ? Math.round((completedSubs / subtasks.length) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/tasks')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-2"
          >
            <RiArrowLeftLine size={13} /> All tasks
          </button>
          <h1 className={`text-2xl font-bold leading-snug ${isDone ? 'text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </h1>
          {/* Meta line */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={statusVariants[task.status]}>{task.status.replace('_', ' ')}</Badge>
            <Badge variant={priorityVariants[task.priority]}>{task.priority} priority</Badge>
            {task.due_date && (
              <>
                <span className="text-gray-200">·</span>
                <span className={`text-sm ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  {isOverdue ? 'Overdue — was due ' : 'Due '}
                  {format(parseISO(task.due_date), 'MMMM d, yyyy')}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <motion.div whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
            <Button variant="secondary" size="sm" onClick={toggleDone} disabled={toggling}>
              {isDone
                ? <><RiCircleLine size={14} className="mr-1" /> Reopen</>
                : <><RiCheckboxCircleLine size={14} className="mr-1" /> Mark complete</>
              }
            </Button>
          </motion.div>
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            <RiPencilLine size={14} className="mr-1" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>Archive</Button>
        </div>
      </div>

      {/* Completion / overdue callout */}
      {isDone && task.completed_at && (
        <div className="flex items-center gap-2.5 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <RiCheckboxCircleLine size={16} className="text-green-500 shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            Completed {format(parseISO(task.completed_at), 'MMMM d, yyyy')}
          </p>
        </div>
      )}
      {isOverdue && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600 font-medium">
            This task is overdue — it was due {format(parseISO(task.due_date!), 'MMMM d, yyyy')}.
          </p>
        </div>
      )}

      {/* Notes */}
      {task.notes && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</p>
          <MarkdownContent content={task.notes} />
        </div>
      )}

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Subtasks
            </p>
            <span className="text-xs text-gray-400">{completedSubs} of {subtasks.length} done</span>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all duration-300"
              style={{ width: `${subtaskPct}%` }}
            />
          </div>
          <div className="space-y-0.5">
            {subtasks.map(sub => (
              <div
                key={sub.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => toggleSubtask(sub)}
              >
                <button className="shrink-0" onClick={e => { e.stopPropagation(); toggleSubtask(sub) }}>
                  {sub.completed
                    ? <RiCheckboxCircleLine size={17} className="text-indigo-500" />
                    : <RiCircleLine size={17} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                  }
                </button>
                <span className={`text-sm select-none ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {sub.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects — bottom, separated */}
      {selectedProjects.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Projects</p>
          <div className="flex gap-1.5 flex-wrap">
            {selectedProjects.map(p => <ProjectTag key={p} name={p} projectId={nameToId[p]} />)}
          </div>
        </div>
      )}

      {/* Archive modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Archive task?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This task will be archived and permanently deleted after 90 days.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Archive</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
