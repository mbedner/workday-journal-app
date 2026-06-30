import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Task } from '../../types'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { TagInput } from './TagInput'
import { RichTextEditor } from './RichTextEditor'
import { useProjects } from '../../hooks/useProjects'
import { useToast } from '../../contexts/ToastContext'

type Status = Task['status']
type Priority = Task['priority']

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

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  sourceType?: string
  sourceId?: string | null
}

export function TaskModal({ open, onClose, onSuccess, sourceType, sourceId }: Props) {
  const { addToast } = useToast()
  const { projects: allProjects, create: createProject } = useProjects()
  const [form, setForm] = useState<TaskForm>(defaultForm)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const handleClose = () => {
    setForm(defaultForm)
    setSelectedProjects([])
    onClose()
  }

  const submit = async () => {
    if (!form.title.trim()) return
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        user_id: user!.id,
        title: form.title.trim(),
        notes: form.notes || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        source_type: sourceType ?? 'manual',
        source_id: sourceId ?? null,
        updated_at: new Date().toISOString(),
      }

      const { data: task } = await supabase.from('tasks').insert(payload).select().single()

      if (task && selectedProjects.length > 0) {
        const projectIds = await Promise.all(
          selectedProjects.map(async name => {
            let proj = allProjects.find(p => p.name === name)
            if (!proj) { const { data } = await createProject(name); proj = data }
            return proj?.id
          })
        )
        const rows = projectIds.filter(Boolean).map(pid => ({
          user_id: user!.id, task_id: task.id, project_id: pid,
        }))
        if (rows.length) await supabase.from('task_projects').insert(rows)
      }

      addToast('Task added', 'success')
      handleClose()
      onSuccess?.()
    } catch {
      addToast('Failed to add task', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add task"
      size="lg"
      footer={
        <>
          <div />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={submit} loading={submitting} disabled={!form.title.trim()}>Add task</Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Title"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="Task title"
          required
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit() }}
        />
        <RichTextEditor
          label="Notes"
          value={form.notes}
          onChange={html => setForm({ ...form, notes: html })}
          placeholder="Optional notes, links, context..."
          minHeight={100}
        />
        <TagInput
          label="Projects"
          values={selectedProjects}
          suggestions={allProjects.map(p => p.name)}
          onChange={setSelectedProjects}
          placeholder="Associate with a project..."
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Status"
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value as Status })}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </Select>
          <Select
            label="Priority"
            value={form.priority}
            onChange={e => setForm({ ...form, priority: e.target.value as Priority })}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <Input
          label="Due date"
          type="date"
          value={form.due_date}
          onChange={e => setForm({ ...form, due_date: e.target.value })}
        />
      </div>
    </Modal>
  )
}
