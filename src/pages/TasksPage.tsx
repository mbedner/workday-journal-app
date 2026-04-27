import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Task } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'

type Status = Task['status']
type Priority = Task['priority']

const statusVariants: Record<Status, 'yellow' | 'blue' | 'green' | 'red'> = {
  todo: 'yellow', in_progress: 'blue', done: 'green', blocked: 'red',
}
const priorityVariants: Record<Priority, 'red' | 'yellow' | 'gray'> = {
  high: 'red', medium: 'yellow', low: 'gray',
}

const statusLabel: Record<Status, string> = {
  todo: 'To do', in_progress: 'In progress', done: 'Done', blocked: 'Blocked',
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
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchTasks = async () => {
    setLoading(true)
    const q = supabase.from('tasks').select('*')
    let { data } = await q
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
    } else {
      await supabase.from('tasks').insert({ ...payload, user_id: user!.id, source_type: 'manual' })
    }
    await fetchTasks()
    setModalOpen(false)
    setSubmitting(false)
  }

  const changeStatus = async (id: string, status: Status) => {
    const patch: Partial<Task> = { status, updated_at: new Date().toISOString() }
    if (status === 'done') patch.completed_at = new Date().toISOString()
    await supabase.from('tasks').update(patch).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
    setDeleteId(null)
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
    return b.created_at.localeCompare(a.created_at)
  })

  const filtered = sorted.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">{tasks.filter(t => t.status !== 'done').length} open tasks</p>
        </div>
        <Button onClick={openAdd}>+ Add task</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[160px]" />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
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
          title={search || statusFilter || priorityFilter ? 'No tasks match your filters' : 'No tasks yet'}
          description="Add one manually or create tasks from a journal entry or transcript."
          action={!search && !statusFilter ? { label: '+ Add task', onClick: openAdd } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
          {filtered.map(task => (
            <Card key={task.id} className="hover:border-indigo-200 transition-all">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {task.title}
                    </span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                    <Badge variant={statusVariants[task.status]}>{statusLabel[task.status]}</Badge>
                    <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                    {task.due_date && (
                      <span className="text-xs text-gray-400">Due {task.due_date}</span>
                    )}
                    {task.source_type !== 'manual' && (
                      <span className="text-xs text-gray-400">from {task.source_type}</span>
                    )}
                  </div>
                  {task.notes && (
                    <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Select
                    value={task.status}
                    onChange={e => changeStatus(task.id, e.target.value as Status)}
                    className="text-xs py-1 px-2 h-7"
                  >
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </Select>
                  <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded">
                    ✎
                  </button>
                  <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded">
                    ×
                  </button>
                </div>
              </div>
            </Card>
          ))}
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
