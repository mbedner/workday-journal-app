import { useState, useEffect } from 'react'
import type { PageContext, Settings, Metadata } from './types'
import { SourcePreview } from './SourcePreview'
import { MultiSelect } from './MultiSelect'
import { capture } from './api'

interface Props {
  pageCtx: PageContext
  settings: Settings
  metadata: Metadata
  metaLoading: boolean
  pendingText: string
  onSuccess: (type: string, id: string) => void
}

export function TaskForm({ pageCtx, settings, metadata, metaLoading, pendingText, onSuccess }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [subtasks, setSubtasks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill from selected text (context menu) or page title
  useEffect(() => {
    if (pendingText) {
      setTitle(pendingText.slice(0, 120))
      setNotes(pendingText.length > 120 ? pendingText : '')
    } else {
      setTitle(pageCtx.title.slice(0, 120))
    }
  }, [pendingText, pageCtx.title])

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (!settings.token || !settings.appUrl) { setError('Configure your token and app URL in settings'); return }

    setSaving(true)
    setError('')

    const subtaskList = subtasks
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)

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
      setError(err.message ?? 'Failed to save. Check your settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Task title..."
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Additional context..."
          rows={2}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Status + Priority */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {/* Due Date */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Projects */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Projects</label>
        <MultiSelect
          options={metadata.projects}
          selected={projects}
          onChange={setProjects}
          placeholder={metaLoading ? 'Loading...' : 'Select projects...'}
        />
      </div>

      {/* Subtasks */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Subtasks <span className="text-gray-400 font-normal">(one per line)</span>
        </label>
        <textarea
          value={subtasks}
          onChange={e => setSubtasks(e.target.value)}
          placeholder="Subtask one&#10;Subtask two"
          rows={2}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Source preview */}
      <SourcePreview url={pageCtx.url} title={pageCtx.title} />

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim()}
        className="w-full py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {saving ? 'Saving…' : 'Save Task'}
      </button>
    </div>
  )
}
