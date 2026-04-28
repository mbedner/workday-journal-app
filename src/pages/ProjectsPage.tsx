import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RiPencilLine, RiDeleteBinLine, RiArrowRightSLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Project } from '../types'
import { useProjects } from '../hooks/useProjects'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../contexts/ToastContext'
import { SkListCard } from '../components/ui/Skeleton'
import { useState } from 'react'
import { listVariants, itemVariants } from '../lib/motion'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { projects, loading, create, update, remove } = useProjects()
  const [modalOpen, setModalOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, { journals: number; tasks: number; transcripts: number }>>({})

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
        await update(editProject.id, name.trim(), description || undefined)
        addToast('Project updated', 'success')
      } else {
        await create(name.trim(), description || undefined)
        addToast('Project created', 'success')
      }
      setModalOpen(false)
    } catch {
      addToast('Failed to save project', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await remove(deleteId)
      addToast('Project deleted', 'info')
    } catch {
      addToast('Failed to delete project', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openAdd}>+ New project</Button>
      </div>

      {loading ? (
        <SkListCard rows={3} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create projects to group journals, tasks, and meeting notes by topic or initiative."
          action={{ label: '+ New project', onClick: openAdd }}
        />
      ) : (
        <motion.div
          className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {projects.map(p => (
            <motion.div
              key={p.id}
              variants={itemVariants}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors cursor-pointer group"
              onClick={() => { loadCounts(p.id); navigate(`/projects/${p.id}`) }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
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
                <button
                  onClick={e => openEdit(e, p)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded"
                >
                  <RiPencilLine size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteId(p.id) }}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition rounded"
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </div>

              <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
            </motion.div>
          ))}
        </motion.div>
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

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete project?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Deleting this project won't delete linked content, but all links will be removed.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
