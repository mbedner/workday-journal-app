import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { PageContext, Settings, Metadata } from './types'
import { SourcePreview } from './SourcePreview'
import { MultiSelect } from './MultiSelect'
import { capture } from './api'

export interface TaskFormHandle {
  submit: () => Promise<void>
}

interface Props {
  pageCtx: PageContext
  settings: Settings
  metadata: Metadata
  metaLoading: boolean
  selectedText: string
  onSaving: (v: boolean) => void
  onError: (msg: string) => void
  onSuccess: (type: string, id: string) => void
}

export const TaskForm = forwardRef<TaskFormHandle, Props>(
  ({ pageCtx, settings, metadata, metaLoading, selectedText, onSaving, onError, onSuccess }, ref) => {
    const [title, setTitle] = useState('')
    const [notes, setNotes] = useState('')
    const [status, setStatus] = useState('todo')
    const [priority, setPriority] = useState('medium')
    const [dueDate, setDueDate] = useState('')
    const [projects, setProjects] = useState<string[]>([])
    const [subtasks, setSubtasks] = useState('')

    // Pre-fill: selected text wins over page title
    useEffect(() => {
      if (selectedText) {
        setTitle(selectedText.slice(0, 120))
        if (selectedText.length > 120) setNotes(selectedText)
      } else if (pageCtx.title) {
        setTitle(pageCtx.title.slice(0, 120))
      }
    }, [selectedText, pageCtx.title])

    useImperativeHandle(ref, () => ({
      submit: async () => {
        if (!title.trim()) { onError('Title is required'); return }
        if (!settings.token || !settings.appUrl) { onError('Configure your token and app URL in settings'); return }

        onSaving(true)
        onError('')
        const subtaskList = subtasks.split('\n').map(s => s.trim()).filter(Boolean)

        try {
          const { id } = await capture(settings, 'task', {
            title: title.trim(),
            notes: notes.trim() || undefined,
            status,
            priority,
            due_date: dueDate || undefined,
            source_url: pageCtx.url || undefined,
            source_title: pageCtx.title || undefined,
            projects,
            subtasks: subtaskList,
          })
          onSuccess('task', id)
        } catch (err: any) {
          onError(err.message ?? 'Failed to save. Check your settings.')
        } finally {
          onSaving(false)
        }
      },
    }))

    const field = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition placeholder:text-gray-300'
    const label = 'block text-xs font-medium text-gray-500 mb-1'
    const selectWrap = 'relative'
    const selectField = 'w-full text-sm pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition appearance-none'

    return (
      <div className="space-y-3 py-1">
        <div>
          <label className={label}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" className={field} autoFocus />
        </div>

        <div>
          <label className={label}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context…" rows={2} className={field} />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={label}>Status</label>
            <div className={selectWrap}>
              <select value={status} onChange={e => setStatus(e.target.value)} className={selectField}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
              <Chevron />
            </div>
          </div>
          <div className="flex-1">
            <label className={label}>Priority</label>
            <div className={selectWrap}>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={selectField}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <Chevron />
            </div>
          </div>
        </div>

        <div>
          <label className={label}>Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={field} />
        </div>

        <div>
          <label className={label}>Projects</label>
          <MultiSelect
            options={metadata.projects}
            selected={projects}
            onChange={setProjects}
            placeholder={metaLoading ? 'Loading…' : 'Select projects…'}
          />
        </div>

        <div>
          <label className={label}>
            Subtasks <span className="text-gray-300 font-normal">(one per line)</span>
          </label>
          <textarea
            value={subtasks}
            onChange={e => setSubtasks(e.target.value)}
            placeholder={'Research options\nWrite draft'}
            rows={2}
            className={field}
          />
        </div>

        <SourcePreview url={pageCtx.url} title={pageCtx.title} />
      </div>
    )
  }
)

TaskForm.displayName = 'TaskForm'

function Chevron() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}
