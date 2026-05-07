import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RiPencilLine, RiDeleteBinLine, RiCheckboxCircleLine, RiCircleLine, RiCloseLine, RiAddLine, RiArrowDownSLine } from '@remixicon/react'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Task, Subtask } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { RichTextEditor } from '../components/ui/RichTextEditor'
import { TagInput } from '../components/ui/TagInput'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../contexts/ToastContext'
import { useProjects } from '../hooks/useProjects'
import { SkListCard, SkGridCards, SkCalendar } from '../components/ui/Skeleton'
import { FilterSheet, FilterTrigger, FilterRow } from '../components/ui/FilterSheet'
import { ProjectTag } from '../components/ui/ProjectTag'
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle'
import { CalendarView, CalendarItem } from '../components/ui/CalendarView'

type Status = Task['status']
type Priority = Task['priority']

function stripMarkup(text: string): string {
  if (!text) return ''
  return text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

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

// Map taskId → project names for display
type ProjectMap = Record<string, string[]>

export function TasksPage() {
  const { addToast } = useToast()
  const { projects: allProjects, create: createProject } = useProjects()
  const [searchParams] = useSearchParams()

  const [tasks, setTasks] = useState<Task[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [projectMap, setProjectMap] = useState<ProjectMap>({})
  const [subtaskMap, setSubtaskMap] = useState<Record<string, Subtask[]>>({})
  const [modalSubtasks, setModalSubtasks] = useState<Subtask[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [subtaskAdding, setSubtaskAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('tasks-status') ?? 'open')
  const [priorityFilter, setPriorityFilter] = useState(() => localStorage.getItem('tasks-priority') ?? '')
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? localStorage.getItem('tasks-project') ?? '')
  const [groupBy, setGroupBy] = useState<'none' | 'project'>(
    () => (localStorage.getItem('tasks-groupby') as 'none' | 'project') ?? 'none'
  )
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(() => localStorage.getItem('tasks-sort') ?? 'newest')

  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('tasks-view') as ViewMode) ?? 'list'
  )
  const handleViewChange = (v: ViewMode) => { setView(v); localStorage.setItem('tasks-view', v) }
  const handleGroupByChange = (v: 'none' | 'project') => { setGroupBy(v); localStorage.setItem('tasks-groupby', v) }

  // Persist filter/sort state across navigations
  useEffect(() => {
    localStorage.setItem('tasks-status', statusFilter)
    localStorage.setItem('tasks-priority', priorityFilter)
    localStorage.setItem('tasks-project', projectFilter)
    localStorage.setItem('tasks-sort', sort)
  }, [statusFilter, priorityFilter, projectFilter, sort])
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const nameToId = useMemo(
    () => Object.fromEntries(allProjects.map(p => [p.name, p.id])),
    [allProjects]
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>(defaultForm)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) => setExpandedTasks(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const PAGE_SIZE = 100

  const fetchTasks = async (replace = true) => {
    if (replace) setLoading(true)
    const from = replace ? 0 : tasks.length

    // Build server-side filtered query so totalCount and pagination are accurate
    let q = supabase.from('tasks').select('*', { count: 'exact' }).is('archived_at', null)
    if (statusFilter === 'open') q = q.neq('status', 'done')
    else if (statusFilter) q = q.eq('status', statusFilter)
    if (priorityFilter) q = q.eq('priority', priorityFilter)
    if (sort === 'due_date') q = q.order('due_date', { ascending: true, nullsFirst: false })
    else q = q.order('created_at', { ascending: sort === 'oldest' })
    q = q.range(from, from + PAGE_SIZE - 1)

    const [{ data: taskData, count }, { data: tpData }] = await Promise.all([
      q,
      supabase.from('task_projects').select('task_id, projects(name)'),
    ])
    const loadedTasks = taskData ?? []

    if (replace) {
      setTasks(loadedTasks)
      setTotalCount(count ?? 0)
    } else {
      setTasks(prev => [...prev, ...loadedTasks])
    }

    // Build projectMap: taskId → [project names]
    const map: ProjectMap = {}
    for (const row of (tpData ?? []) as any[]) {
      if (!row.task_id || !row.projects?.name) continue
      if (!map[row.task_id]) map[row.task_id] = []
      map[row.task_id].push(row.projects.name)
    }
    setProjectMap(map)

    // Fetch subtasks for this page of tasks
    if (loadedTasks.length > 0) {
      const ids = loadedTasks.map((t: Task) => t.id)
      const { data: stData } = await supabase
        .from('subtasks').select('*').in('task_id', ids).order('position')
      const stMap: Record<string, Subtask[]> = {}
      for (const s of (stData ?? []) as Subtask[]) {
        if (!stMap[s.task_id]) stMap[s.task_id] = []
        stMap[s.task_id].push(s)
      }
      setSubtaskMap(prev => replace ? stMap : { ...prev, ...stMap })
    }

    if (replace) setLoading(false)
    else setLoadingMore(false)
  }

  // Refetch from page 1 whenever server-side filter params change
  useEffect(() => { fetchTasks(true) }, [statusFilter, priorityFilter, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMoreTasks = () => {
    setLoadingMore(true)
    fetchTasks(false)
  }

  const hasMoreTasks = tasks.length < totalCount

  const openAdd = () => {
    setEditTask(null)
    setForm(defaultForm)
    setSelectedProjects([])
    setModalOpen(true)
  }

  const openEdit = async (t: Task) => {
    setEditTask(t)
    setForm({ title: t.title, notes: t.notes ?? '', status: t.status, priority: t.priority, due_date: t.due_date ?? '' })
    setSelectedProjects(projectMap[t.id] ?? [])
    setModalSubtasks(subtaskMap[t.id] ?? [])
    setNewSubtaskTitle('')
    setModalOpen(true)
  }

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim() || !editTask) return
    setSubtaskAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    const position = modalSubtasks.length
    const { data } = await supabase
      .from('subtasks')
      .insert({ task_id: editTask.id, user_id: user!.id, title: newSubtaskTitle.trim(), completed: false, position })
      .select().single()
    if (data) {
      const newSub = data as Subtask
      setModalSubtasks(prev => [...prev, newSub])
      setSubtaskMap(prev => ({ ...prev, [editTask.id]: [...(prev[editTask.id] ?? []), newSub] }))
      setNewSubtaskTitle('')
    }
    setSubtaskAdding(false)
  }

  const toggleSubtask = async (sub: Subtask) => {
    const updated = { ...sub, completed: !sub.completed }
    await supabase.from('subtasks').update({ completed: updated.completed }).eq('id', sub.id)
    setModalSubtasks(prev => prev.map(s => s.id === sub.id ? updated : s))
    setSubtaskMap(prev => ({ ...prev, [sub.task_id]: (prev[sub.task_id] ?? []).map(s => s.id === sub.id ? updated : s) }))
  }

  const deleteSubtask = async (sub: Subtask) => {
    await supabase.from('subtasks').delete().eq('id', sub.id)
    setModalSubtasks(prev => prev.filter(s => s.id !== sub.id))
    setSubtaskMap(prev => ({ ...prev, [sub.task_id]: (prev[sub.task_id] ?? []).filter(s => s.id !== sub.id) }))
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

      let taskId: string
      if (editTask) {
        await supabase.from('tasks').update(payload).eq('id', editTask.id)
        taskId = editTask.id
        addToast('Task updated', 'success')
      } else {
        const { data } = await supabase.from('tasks').insert({ ...payload, user_id: user!.id, source_type: 'manual' }).select().single()
        taskId = data!.id
        addToast('Task added', 'success')
      }

      // Sync project associations
      await supabase.from('task_projects').delete().eq('task_id', taskId)
      if (selectedProjects.length > 0) {
        const projectIds = await Promise.all(
          selectedProjects.map(async name => {
            let proj = allProjects.find(p => p.name === name)
            if (!proj) { const { data } = await createProject(name); proj = data }
            return proj?.id
          })
        )
        const rows = projectIds.filter(Boolean).map(pid => ({ user_id: user!.id, task_id: taskId, project_id: pid }))
        if (rows.length) await supabase.from('task_projects').insert(rows)
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
      await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', id)
      setTasks(prev => prev.filter(t => t.id !== id))
      addToast('Task archived', 'info')
    } catch {
      addToast('Failed to archive task', 'error')
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
    const aDone = a.status === 'done' ? 1 : 0
    const bDone = b.status === 'done' ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    return b.created_at.localeCompare(a.created_at)
  })

  // status + priority are handled server-side; only project + search remain client-side
  const filtered = sorted.filter(t => {
    if (projectFilter) {
      const taskProjects = projectMap[t.id] ?? []
      if (!taskProjects.includes(projectFilter)) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)
    }
    return true
  })

  // Load more is only valid when no client-side-only filters are active
  const canLoadMore = hasMoreTasks && !search && !projectFilter

  // Group by project — tasks in multiple projects appear in each group
  const groupedByProject = useMemo(() => {
    if (groupBy !== 'project' || view === 'calendar') return null
    const groups = new Map<string, Task[]>()
    for (const task of filtered) {
      const projects = projectMap[task.id] ?? []
      if (projects.length === 0) {
        if (!groups.has('__none__')) groups.set('__none__', [])
        groups.get('__none__')!.push(task)
      } else {
        for (const p of projects) {
          if (!groups.has(p)) groups.set(p, [])
          groups.get(p)!.push(task)
        }
      }
    }
    // Named projects alphabetically, "No project" last
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return a.localeCompare(b)
    })
  }, [filtered, projectMap, groupBy, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const calendarItems: CalendarItem[] = useMemo(() => filtered
    .filter(t => t.due_date)
    .map(t => {
      const isDone = t.status === 'done'
      const isOverdue = !isDone && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
      return {
        id: t.id,
        date: t.due_date!,
        label: t.title,
        url: `/tasks/${t.id}`,
        color: isDone ? 'gray' : isOverdue ? 'red' : t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'indigo',
      }
    }), [filtered]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${totalCount} task${totalCount !== 1 ? 's' : ''}${canLoadMore ? ` · ${tasks.length} loaded` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={handleViewChange} options={['list', 'grid', 'calendar']} />
          <Button onClick={openAdd}>+ Add task</Button>
        </div>
      </div>

      {/* Mobile: search + filter trigger */}
      <div className="flex gap-2 sm:hidden">
        <div className="flex-1 min-w-0">
          <Input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} className="w-full" />
        </div>
        <FilterTrigger
          onClick={() => setFilterSheetOpen(true)}
          activeCount={[
            statusFilter && statusFilter !== 'open' ? statusFilter : '',
            priorityFilter,
            projectFilter,
            groupBy !== 'none' ? groupBy : '',
            sort !== 'newest' ? sort : '',
          ].filter(Boolean).length}
        />
      </div>

      {/* Desktop: full inline filter bar */}
      <div className="hidden sm:flex gap-3 flex-wrap">
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
        {allProjects.length > 0 && (
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-40">
            <option value="">All projects</option>
            {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </Select>
        )}
        <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as 'none' | 'project')} className="w-40">
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-32">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="priority">Priority</option>
          <option value="due_date">Due date</option>
        </Select>
      </div>

      {/* Mobile filter sheet */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeCount={[
          statusFilter && statusFilter !== 'open' ? statusFilter : '',
          priorityFilter,
          projectFilter,
          groupBy !== 'none' ? groupBy : '',
          sort !== 'newest' ? sort : '',
        ].filter(Boolean).length}
      >
        <FilterRow label="Status">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full">
            <option value="open">Open tasks</option>
            <option value="">All tasks</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Completed</option>
          </Select>
        </FilterRow>
        <FilterRow label="Priority">
          <Select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full">
            <option value="">All priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </FilterRow>
        {allProjects.length > 0 && (
          <FilterRow label="Project">
            <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-full">
              <option value="">All projects</option>
              {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          </FilterRow>
        )}
        <FilterRow label="Group by">
          <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as 'none' | 'project')} className="w-full">
            <option value="none">No grouping</option>
            <option value="project">Project</option>
          </Select>
        </FilterRow>
        <FilterRow label="Sort">
          <Select value={sort} onChange={e => setSort(e.target.value)} className="w-full">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">By priority</option>
            <option value="due_date">By due date</option>
          </Select>
        </FilterRow>
      </FilterSheet>

      {loading ? (
        view === 'calendar' ? <SkCalendar /> :
        view === 'grid'     ? <SkGridCards count={6} /> :
        <SkListCard rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || (statusFilter && statusFilter !== 'open') || priorityFilter || projectFilter ? 'No tasks match your filters' : 'No tasks yet'}
          description="Add tasks manually or create them from a journal entry or meeting note."
          action={!search && !priorityFilter && !projectFilter ? { label: '+ Add task', onClick: openAdd } : undefined}
        />
      ) : view === 'calendar' ? (
        <>
          <CalendarView items={calendarItems} />
          {filtered.filter(t => !t.due_date).length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {filtered.filter(t => !t.due_date).length} task{filtered.filter(t => !t.due_date).length !== 1 ? 's' : ''} without a due date not shown on calendar.
            </p>
          )}
        </>
      ) : view === 'grid' ? (
        <>
          {groupedByProject ? (
            <div className="space-y-6">
              {groupedByProject.map(([group, groupTasks]) => (
                <div key={group}>
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                      {group === '__none__' ? 'No project' : group}
                    </p>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-300 shrink-0">{groupTasks.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupTasks.map(task => {
                      const isDone = task.status === 'done'
                      const isToggling = toggling === task.id
                      const taskProjects = projectMap[task.id] ?? []
                      const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                      const subs = subtaskMap[task.id] ?? []
                      return (
                        <div key={task.id} className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm transition-all group ${isDone ? 'opacity-60' : 'hover:border-indigo-200'}`}>
                          <div className="flex items-start gap-2">
                            <motion.button onClick={() => toggleDone(task)} disabled={isToggling} className="mt-0.5 shrink-0 disabled:opacity-40" whileTap={{ scale: 0.75 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                              {isDone ? <RiCheckboxCircleLine size={18} className="text-indigo-500" /> : <RiCircleLine size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
                            </motion.button>
                            <p className={`text-sm font-medium leading-snug flex-1 ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button onClick={() => openEdit(task)} className="p-1 text-gray-400 hover:text-indigo-600 transition rounded"><RiPencilLine size={13} /></button>
                              <button onClick={() => setDeleteId(task.id)} className="p-1 text-gray-400 hover:text-red-500 transition rounded"><RiDeleteBinLine size={13} /></button>
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-wrap items-center mt-auto">
                            {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                            {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                            <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                            {taskProjects.map(p => <ProjectTag key={p} name={p} projectId={nameToId[p]} />)}
                            {task.due_date && (
                              <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                                {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                              </span>
                            )}
                            {subs.length > 0 && (
                              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                <RiCheckboxCircleLine size={11} className={subs.every(s => s.completed) ? 'text-indigo-400' : 'text-gray-300'} />
                                {subs.filter(s => s.completed).length}/{subs.length}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(task => {
                const isDone = task.status === 'done'
                const isToggling = toggling === task.id
                const taskProjects = projectMap[task.id] ?? []
                const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                const subs = subtaskMap[task.id] ?? []
                return (
                  <div
                    key={task.id}
                    className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm transition-all group ${isDone ? 'opacity-60' : 'hover:border-indigo-200'}`}
                  >
                    <div className="flex items-start gap-2">
                      <motion.button
                        onClick={() => toggleDone(task)}
                        disabled={isToggling}
                        className="mt-0.5 shrink-0 disabled:opacity-40"
                        whileTap={{ scale: 0.75 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      >
                        {isDone
                          ? <RiCheckboxCircleLine size={18} className="text-indigo-500" />
                          : <RiCircleLine size={18} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                        }
                      </motion.button>
                      <p className={`text-sm font-medium leading-snug flex-1 ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openEdit(task)} className="p-1 text-gray-400 hover:text-indigo-600 transition rounded">
                          <RiPencilLine size={13} />
                        </button>
                        <button onClick={() => setDeleteId(task.id)} className="p-1 text-gray-400 hover:text-red-500 transition rounded">
                          <RiDeleteBinLine size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap items-center mt-auto">
                      {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                      {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                      <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                      {taskProjects.map(p => <ProjectTag key={p} name={p} projectId={nameToId[p]} />)}
                      {task.due_date && (
                        <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                          {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                        </span>
                      )}
                      {subs.length > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <RiCheckboxCircleLine size={11} className={subs.every(s => s.completed) ? 'text-indigo-400' : 'text-gray-300'} />
                          {subs.filter(s => s.completed).length}/{subs.length}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMoreTasks} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{tasks.length} of {totalCount} tasks loaded</p>
            </div>
          )}
        </>
      ) : (
        /* List view */
        <>
          {groupedByProject ? (
            <div className="space-y-4">
              {groupedByProject.map(([group, groupTasks]) => (
                <div key={group}>
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                      {group === '__none__' ? 'No project' : group}
                    </p>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-300 shrink-0">{groupTasks.length}</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {groupTasks.map(task => {
                      const isDone = task.status === 'done'
                      const isToggling = toggling === task.id
                      const taskProjects = projectMap[task.id] ?? []
                      const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                      const subs = subtaskMap[task.id] ?? []
                      const isExpanded = expandedTasks.has(task.id)
                      return (
                        <div key={task.id}>
                          <div className={`flex items-start gap-3 px-4 py-3.5 group transition-colors ${isDone ? 'bg-gray-50/50' : 'hover:bg-indigo-50/60'}`}>
                            <motion.button onClick={() => toggleDone(task)} disabled={isToggling} className="mt-0.5 shrink-0 transition-colors disabled:opacity-40" aria-label={isDone ? 'Mark incomplete' : 'Mark complete'} whileTap={{ scale: 0.75 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                              {isDone ? <RiCheckboxCircleLine size={20} className="text-indigo-500" /> : <RiCircleLine size={20} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
                            </motion.button>
                            <Link to={`/tasks/${task.id}`} className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                              <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                                {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                                {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                                <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                                {taskProjects.map(p => <ProjectTag key={p} name={p} projectId={nameToId[p]} />)}
                                {task.due_date && (
                                  <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                                  </span>
                                )}
                                {task.notes && (
                                  <span className="text-xs text-gray-400 truncate max-w-xs hidden sm:block">{stripMarkup(task.notes)}</span>
                                )}
                                {subs.length > 0 && (
                                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                    <RiCheckboxCircleLine size={11} className={subs.every(s => s.completed) ? 'text-indigo-400' : 'text-gray-300'} />
                                    {subs.filter(s => s.completed).length}/{subs.length}
                                  </span>
                                )}
                              </div>
                            </Link>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {subs.length > 0 && (
                                <button
                                  onClick={e => { e.preventDefault(); toggleExpanded(task.id) }}
                                  className={`p-1.5 rounded transition-colors ${isExpanded ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400'}`}
                                  aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                >
                                  <RiArrowDownSLine size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded"><RiPencilLine size={14} /></button>
                                <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded"><RiDeleteBinLine size={14} /></button>
                              </div>
                            </div>
                          </div>
                          <AnimatePresence>
                            {isExpanded && subs.length > 0 && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-2 pt-0.5">
                                  <div className="ml-6">
                                    {subs.map((sub, idx) => (
                                      <div key={sub.id} className="flex items-center gap-2 py-1">
                                        <div className="relative self-stretch shrink-0 w-3">
                                          <div className={`absolute left-0 w-px bg-gray-200 ${idx === subs.length - 1 ? 'top-0 bottom-1/2' : 'inset-y-0'}`} />
                                          <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-200" />
                                        </div>
                                        <button onClick={() => toggleSubtask(sub)} className="shrink-0 transition-colors">
                                          {sub.completed
                                            ? <RiCheckboxCircleLine size={15} className="text-indigo-400" />
                                            : <RiCircleLine size={15} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                                          }
                                        </button>
                                        <span className={`text-sm leading-snug ${sub.completed ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                          {sub.title}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {filtered.map(task => {
                const isDone = task.status === 'done'
                const isToggling = toggling === task.id
                const taskProjects = projectMap[task.id] ?? []
                const isOverdue = !isDone && task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                const subs = subtaskMap[task.id] ?? []
                const isExpanded = expandedTasks.has(task.id)
                return (
                  <div key={task.id}>
                    <div className={`flex items-start gap-3 px-4 py-3.5 group transition-colors ${isDone ? 'bg-gray-50/50' : 'hover:bg-indigo-50/60'}`}>
                      <motion.button
                        onClick={() => toggleDone(task)}
                        disabled={isToggling}
                        className="mt-0.5 shrink-0 transition-colors disabled:opacity-40"
                        aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                        whileTap={{ scale: 0.75 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      >
                        {isDone
                          ? <RiCheckboxCircleLine size={20} className="text-indigo-500" />
                          : <RiCircleLine size={20} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                        }
                      </motion.button>
                      <Link to={`/tasks/${task.id}`} className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.title}
                        </p>
                        <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                          {task.status === 'in_progress' && <Badge variant="blue">In progress</Badge>}
                          {task.status === 'blocked' && <Badge variant="red">Blocked</Badge>}
                          <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
                          {taskProjects.map(p => <ProjectTag key={p} name={p} projectId={nameToId[p]} />)}
                          {task.due_date && (
                            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                              {isOverdue ? 'Overdue · ' : 'Due '}{format(parseISO(task.due_date), 'MMM d')}
                            </span>
                          )}
                          {task.notes && (
                            <span className="text-xs text-gray-400 truncate max-w-xs hidden sm:block">{stripMarkup(task.notes)}</span>
                          )}
                          {subs.length > 0 && (
                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                              <RiCheckboxCircleLine size={11} className={subs.every(s => s.completed) ? 'text-indigo-400' : 'text-gray-300'} />
                              {subs.filter(s => s.completed).length}/{subs.length}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {subs.length > 0 && (
                          <button
                            onClick={e => { e.preventDefault(); toggleExpanded(task.id) }}
                            className={`p-1.5 rounded transition-colors ${isExpanded ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-400'}`}
                            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                          >
                            <RiArrowDownSLine size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded">
                            <RiPencilLine size={14} />
                          </button>
                          <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded">
                            <RiDeleteBinLine size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && subs.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-2 pt-0.5">
                            <div className="ml-6">
                              {subs.map((sub, idx) => (
                                <div key={sub.id} className="flex items-center gap-2 py-1">
                                  <div className="relative self-stretch shrink-0 w-3">
                                    <div className={`absolute left-0 w-px bg-gray-200 ${idx === subs.length - 1 ? 'top-0 bottom-1/2' : 'inset-y-0'}`} />
                                    <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-200" />
                                  </div>
                                  <button onClick={() => toggleSubtask(sub)} className="shrink-0 transition-colors">
                                    {sub.completed
                                      ? <RiCheckboxCircleLine size={15} className="text-indigo-400" />
                                      : <RiCircleLine size={15} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                                    }
                                  </button>
                                  <span className={`text-sm leading-snug ${sub.completed ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                    {sub.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          )}
          {canLoadMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMoreTasks} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{tasks.length} of {totalCount} tasks loaded</p>
            </div>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTask ? 'Edit task' : 'Add task'}
        size="lg"
        footer={
          <>
            <div />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={submit} loading={submitting} disabled={!form.title.trim()}>
                {editTask ? 'Save changes' : 'Add task'}
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" required autoFocus />
          <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm({ ...form, notes: html })} placeholder="Optional notes, links to PBIs, context..." minHeight={100} />
          <TagInput
            label="Projects"
            values={selectedProjects}
            suggestions={allProjects.map(p => p.name)}
            onChange={setSelectedProjects}
            placeholder="Associate with a project..."
          />
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

          {editTask && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Subtasks</p>
              {modalSubtasks.length > 0 && (
                <div className="space-y-1 mb-3">
                  {modalSubtasks.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 group/sub py-0.5">
                      <button
                        type="button"
                        onClick={() => toggleSubtask(sub)}
                        className="shrink-0 transition-colors"
                        aria-label={sub.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
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
                        aria-label="Remove subtask"
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addSubtask}
                  loading={subtaskAdding}
                  disabled={!newSubtaskTitle.trim()}
                >
                  <RiAddLine size={14} />
                </Button>
              </div>
            </div>
          )}

        </div>
      </Modal>

      {/* Archive modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Archive task?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This task will be archived and permanently deleted after 90 days. You can restore it from the Archive.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTask(deleteId!)}>Archive</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
