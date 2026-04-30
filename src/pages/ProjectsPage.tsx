import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiPencilLine, RiDeleteBinLine, RiArrowRightSLine, RiCheckboxCircleLine, RiArrowDownSLine, RiArrowUpSLine, RiLoopLeftLine } from '@remixicon/react'
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle'
import { supabase } from '../lib/supabase'
import { Project } from '../types'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../contexts/ToastContext'
import { SkListCard, SkGridCards } from '../components/ui/Skeleton'

const PAGE_SIZE = 30

export function ProjectsPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('projects-view') as ViewMode) ?? 'list'
  )
  const handleViewChange = (v: ViewMode) => { setView(v); localStorage.setItem('projects-view', v) }

  const [modalOpen, setModalOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [completeId, setCompleteId] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, { journals: number; tasks: number; transcripts: number }>>({})

  const fetchProjects = async (replace = true) => {
    if (replace) setLoading(true)
    const from = replace ? 0 : projects.filter(p => !p.completed_at).length
    const { data, count } = await supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .is('archived_at', null)
      .order('completed_at', { ascending: false, nullsFirst: true })
      .order('name')
      .range(from, from + PAGE_SIZE - 1)
    if (replace) {
      setProjects(data ?? [])
      setTotalCount(count ?? 0)
      setLoading(false)
    } else {
      setProjects(prev => [...prev, ...(data ?? [])])
      setLoadingMore(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  const loadMore = () => {
    setLoadingMore(true)
    fetchProjects(false)
  }

  const activeProjects = useMemo(() => projects.filter(p => !p.completed_at), [projects])
  const completedProjects = useMemo(() => projects.filter(p => p.completed_at), [projects])

  const hasMore = projects.length < totalCount

  const filtered = useMemo(() => {
    if (!search) return activeProjects
    const q = search.toLowerCase()
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    )
  }, [projects, activeProjects, search])

  const openAdd = () => { setEditProject(null); setName(''); setDescription(''); setModalOpen(true) }
  const openEdit = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation()
    setEditProject(p); setName(p.name); setDescription(p.description ?? ''); setModalOpen(true)
  }

  const loadCounts = async (projectId: string) => {
    if (counts[projectId]) return
    const [{ count: j }, { count: t }, { count: tr }] = await Promise.all([
      supabase.from('journal_entry_projects').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('task_projects').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('transcript_projects').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ])
    setCounts(prev => ({ ...prev, [projectId]: { journals: j ?? 0, tasks: t ?? 0, transcripts: tr ?? 0 } }))
  }

  const submit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      if (editProject) {
        const { data } = await supabase
          .from('projects')
          .update({ name: name.trim(), description: description || null, updated_at: new Date().toISOString() })
          .eq('id', editProject.id)
          .select().single()
        if (data) setProjects(prev => prev.map(p => p.id === editProject.id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
        addToast('Project updated', 'success')
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { data } = await supabase
          .from('projects')
          .insert({ name: name.trim(), description: description || null, user_id: user!.id })
          .select().single()
        if (data) {
          setProjects(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
          setTotalCount(prev => prev + 1)
        }
        addToast('Project created', 'success')
      }
      setModalOpen(false)
    } catch {
      addToast('Failed to save project', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComplete = async () => {
    if (!completeId) return
    try {
      const { data } = await supabase
        .from('projects')
        .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', completeId)
        .select().single()
      if (data) setProjects(prev => prev.map(p => p.id === completeId ? data : p))
      addToast('Project marked as complete', 'success')
    } catch {
      addToast('Failed to complete project', 'error')
    } finally {
      setCompleteId(null)
    }
  }

  const handleReopen = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      const { data } = await supabase
        .from('projects')
        .update({ completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select().single()
      if (data) setProjects(prev => prev.map(p => p.id === id ? data : p))
      addToast('Project reopened', 'success')
    } catch {
      addToast('Failed to reopen project', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await supabase.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', deleteId)
      setProjects(prev => prev.filter(p => p.id !== deleteId))
      setTotalCount(prev => prev - 1)
      addToast('Project archived', 'info')
    } catch {
      addToast('Failed to archive project', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const subtitle = loading
    ? 'Loading…'
    : search
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}${hasMore ? ` (of ${projects.length} loaded)` : ''}`
      : `${activeProjects.length} active${completedProjects.length > 0 ? `, ${completedProjects.length} completed` : ''}`

  const ProjectCard = ({ p, isCompleted = false }: { p: Project; isCompleted?: boolean }) => (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2 cursor-pointer group hover:shadow-sm transition-all ${isCompleted ? 'opacity-60' : 'hover:border-indigo-200'}`}
      onClick={() => { loadCounts(p.id); navigate(`/projects/${p.id}`) }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-semibold ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>{p.name}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {isCompleted ? (
            <button onClick={e => handleReopen(e, p.id)} className="p-1 text-gray-400 hover:text-indigo-600 transition rounded" title="Reopen">
              <RiLoopLeftLine size={13} />
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); setCompleteId(p.id) }} className="p-1 text-gray-400 hover:text-green-600 transition rounded" title="Mark complete">
              <RiCheckboxCircleLine size={13} />
            </button>
          )}
          <button onClick={e => openEdit(e, p)} className="p-1 text-gray-400 hover:text-indigo-600 transition rounded" title="Edit">
            <RiPencilLine size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); setDeleteId(p.id) }} className="p-1 text-gray-400 hover:text-red-500 transition rounded" title="Archive">
            <RiDeleteBinLine size={13} />
          </button>
        </div>
      </div>
      {p.description && <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>}
      {counts[p.id] && (
        <div className="flex gap-2 mt-auto text-xs text-gray-400 flex-wrap pt-1 border-t border-gray-100">
          <span>{counts[p.id].journals} journal{counts[p.id].journals !== 1 ? 's' : ''}</span>
          <span>{counts[p.id].tasks} task{counts[p.id].tasks !== 1 ? 's' : ''}</span>
          <span>{counts[p.id].transcripts} note{counts[p.id].transcripts !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )

  const ProjectRow = ({ p, isCompleted = false }: { p: Project; isCompleted?: boolean }) => (
    <div
      key={p.id}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors cursor-pointer group"
      onClick={() => { loadCounts(p.id); navigate(`/projects/${p.id}`) }}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>{p.name}</p>
        {p.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>}
        {counts[p.id] && (
          <div className="flex gap-3 mt-1 text-xs text-gray-400">
            <span>{counts[p.id].journals} journal{counts[p.id].journals !== 1 ? 's' : ''}</span>
            <span>{counts[p.id].tasks} task{counts[p.id].tasks !== 1 ? 's' : ''}</span>
            <span>{counts[p.id].transcripts} meeting note{counts[p.id].transcripts !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isCompleted ? (
          <button
            onClick={e => handleReopen(e, p.id)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded"
            title="Reopen"
          >
            <RiLoopLeftLine size={14} />
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setCompleteId(p.id) }}
            className="p-1.5 text-gray-400 hover:text-green-600 transition rounded"
            title="Mark complete"
          >
            <RiCheckboxCircleLine size={14} />
          </button>
        )}
        <button
          onClick={e => openEdit(e, p)}
          className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded"
          title="Edit"
        >
          <RiPencilLine size={14} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); setDeleteId(p.id) }}
          className="p-1.5 text-gray-400 hover:text-red-500 transition rounded"
          title="Archive"
        >
          <RiDeleteBinLine size={14} />
        </button>
      </div>

      <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={handleViewChange} options={['list', 'grid']} />
          <Button onClick={openAdd}>+ New project</Button>
        </div>
      </div>

      <Input
        placeholder="Search projects..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        view === 'grid' ? <SkGridCards count={6} /> : <SkListCard rows={3} />
      ) : search ? (
        /* Search results */
        filtered.length === 0 ? (
          <EmptyState title="No projects match your search" description="" />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(p => <ProjectCard key={p.id} p={p} isCompleted={!!p.completed_at} />)}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {filtered.map(p => <ProjectRow key={p.id} p={p} isCompleted={!!p.completed_at} />)}
          </div>
        )
      ) : activeProjects.length === 0 && completedProjects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create projects to group journals, tasks, and meeting notes by topic or initiative."
          action={{ label: '+ New project', onClick: openAdd }}
        />
      ) : (
        <>
          {/* Active projects */}
          {activeProjects.length > 0 ? (
            view === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeProjects.map(p => <ProjectCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {activeProjects.map(p => <ProjectRow key={p.id} p={p} />)}
              </div>
            )
          ) : (
            <p className="text-sm text-gray-400 italic">No active projects — all done!</p>
          )}

          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load more</Button>
              <p className="text-xs text-gray-400">{projects.length} of {totalCount} projects loaded</p>
            </div>
          )}

          {/* Completed projects */}
          {completedProjects.length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition mb-2"
              >
                {showCompleted ? <RiArrowUpSLine size={14} /> : <RiArrowDownSLine size={14} />}
                Completed ({completedProjects.length})
              </button>
              {showCompleted && (
                view === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {completedProjects.map(p => <ProjectCard key={p.id} p={p} isCompleted />)}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {completedProjects.map(p => <ProjectRow key={p.id} p={p} isCompleted />)}
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editProject ? 'Edit project' : 'New project'}>
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Project name" autoFocus />
          <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project about?" rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={submitting} disabled={!name.trim()}>
              {editProject ? 'Save changes' : 'Create project'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Complete confirmation */}
      <Modal open={!!completeId} onClose={() => setCompleteId(null)} title="Mark project as complete?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This project will be hidden from the active list. All linked journals, tasks, and meeting notes stay exactly as they are. You can reopen it any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCompleteId(null)}>Cancel</Button>
            <Button onClick={handleComplete}>Mark complete</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Archive project?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This project will be archived and permanently deleted after 90 days. Linked content won't be affected. You can restore it from the Archive.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Archive</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
