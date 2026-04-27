import { useEffect, useState } from 'react'
import { RiPencilLine, RiDeleteBinLine, RiCheckboxCircleLine, RiCircleLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Task } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../contexts/ToastContext'
import { format, parseISO, isToday, isPast } from 'date-fns'

type Status = Task['status']
type Priority = Task['priority']

const priorityVariants: Record<Priority, 'red' | 'yellow' | 'gray'> = {
  high: 'red', medium: 'yellow', low: 'gray',
}

interface TaskForm {
  title: string
  notes: string
  status: Status
  priority: Priority
  due_date: string
}

const defaultForm: TaskForm = {
  title: '', notes: '', status: 'todo', priority: 'medium', due_date: '',
}

export function TasksPage() {
  const { addToast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchTasks = async () => {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*')
    setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchTasks() }, [])

  const openAdd = () => { setEditTask(null); setForm(defaultForm); setModalOpen(true) }
  const openEdit = (t: Task) => {
    setEditTask(t)
    setForm({ title: t.title, notes: t.notes ?? '', status: t.status, priority: t.priority, due_date: t.due_date ?? '' })
    setModalOpen(true)
  }

  const submit = async () => {
    if (!form.title.trim()) return
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        title: form.title.trim(),
        notes: form.notes || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        completed_at: form.status === 'done' ? (editTask?.completed_at ?? new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      }
      if (editTask) {
        await supabase.from('tasks').update(payload).eq('id', editTask.id)
        addToast('Task updated', 'success')
      } else {
        await supabase.from('tasks').insert({ ...payload, user_id: user!.id, source_type: 'manual' })
        addToast('Task added', 'success')
      }
      await fetchTasks()
      setModalOpen(false)
    } catch {
      addToast('Failed to save task', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleDone = async (task: Task) => {
    setToggling(task.id)
    const newStatus: Status = task.status === 'done' ? 'todo' : 'done'
    const patch: Partial<Task> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
    }
    await supabase.from('tasks').update(patch).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t))
    setToggling(null)
  }

  const deleteTask = async (id: string) => {
    try {
      await supabase.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(t => t.id !== id))
      addToast('Task deleted', 'info')
    } catch {
      addToast('Failed to delete task', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const sorted = [...tasks].sort((a, b) => {
    if (sort === 'oldest') return a.created_at.localeCompare(b.created_at)
    if (sort === 'priority') {
      const o: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
      return o[a.priority] - o[b.priority]
    }
    if (sort === 'due_date') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    }
    // Default: newest first, but done tasks always sink to bottom
    const aDone = a.status === 'done' ? 1 : 0
    const bDone = b.status === 'done' ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    return b.created_at.localeCompare(a.created_at)
  })

  const filtered = sorted.filter(t => {
    if (statusFilter === 'open' && t.status === 'done') return false
    if (statusFilter && statusFilter !== 'open' && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)
    }
    return true
  })

  const openCount = tasks.filter(t => t.status !== 'done').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">{openCount} open · {doneCount} completed</p>
        </div>
        <Button onClick={openAdd}>+ Add task</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[160px]" />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
          <option value="open">Open tasks</option>
          <option value="">All tasks</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done">Completed</option>
        </Select>
        <Select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-32">
          <option value="">All priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-32">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="priority">Priority</option>
          <option value="due_date">Due date</option>
        </Select>
      </div>

      {loading ? (
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || (statusFilter && statusFilter !== 'open') || priorityFilter ? 'No tasks match your filters' : 'No tasks yet'}
          description="Add tasks manually or create them from a journal entry or meeting note."
          action={!search && !priorityFilter ? { label: '+ Add task', onClick: openAdd } : undefined}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map(task => {
            const isDone = task.status === 'done'
            const isToggling = toggling === task.id
            const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
            return (
              <div
                key={task.id}
                className={`flex items-start gap-3 px-4 py-3.5 group transition-colors ${isDone ? 'bg-gray-50/50' : 'hover:bg-gray-50/60'}`}
              >
                {/* Checkbox toggle */}
                <button
                  onClick={() => toggleDone(task)}
                  disabled={isToggling}
                  className="mt-0.5 shrink-0 transition-colors disabled:opacity-40"
                  aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                  {isDone
                    ? <RiCheckboxCircleLine size={20} className="text-indigo-500" />
                    : <RiCircleLine size={20} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                    {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                    {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                    <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                    {task.due_date && (
                      <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                      </span>
                    )}
                    {task.notes && (
                      <span className="text-xs text-gray-400 truncate max-w-xs hidden sm:block">{task.notes}</span>
                    )}
                  </div>
                </div>

                {/* Hover actions */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded">
                    <RiPencilLine size={14} />
                  </button>
                  <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded">
                    <RiDeleteBinLine size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTask ? 'Edit task' : 'Add task'}>
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" required autoFocus />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </Select>
            <Select label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
          <Input label="Due date" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={submitting} disabled={!form.title.trim()}>
              {editTask ? 'Save changes' : 'Add task'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete task?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTask(deleteId!)}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
