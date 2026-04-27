import { useState } from 'react'
import { RiPencilLine, RiDeleteBinLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Project } from '../types'
import { useProjects } from '../hooks/useProjects'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'

interface RelatedCounts {
  journals: number
  tasks: number
  transcripts: number
}

export function ProjectsPage() {
  const { projects, loading, create, update, remove } = useProjects()
  const [modalOpen, setModalOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, RelatedCounts>>({})

  const openAdd = () => { setEditProject(null); setName(''); setDescription(''); setModalOpen(true) }
  const openEdit = (p: Project) => { setEditProject(p); setName(p.name); setDescription(p.description ?? ''); setModalOpen(true) }

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
    if (editProject) {
      await update(editProject.id, name.trim(), description || undefined)
    } else {
      await create(name.trim(), description || undefined)
    }
    setModalOpen(false)
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await remove(deleteId)
    setDeleteId(null)
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
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create projects to group journals, tasks, and transcripts by topic or initiative."
          action={{ label: '+ New project', onClick: openAdd }}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {projects.map(p => (
            <Card
              key={p.id}
              className="hover:border-indigo-200 transition-all cursor-pointer"
              onClick={() => loadCounts(p.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  {counts[p.id] && (
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>{counts[p.id].journals} journal{counts[p.id].journals !== 1 ? 's' : ''}</span>
                      <span>{counts[p.id].tasks} task{counts[p.id].tasks !== 1 ? 's' : ''}</span>
                      <span>{counts[p.id].transcripts} transcript{counts[p.id].transcripts !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(p) }}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded"
                  >
                    <RiPencilLine size={15} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteId(p.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition rounded"
                  >
                    <RiDeleteBinLine size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
          <p className="text-sm text-gray-600">Deleting this project won't delete linked content, but links will be removed.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
