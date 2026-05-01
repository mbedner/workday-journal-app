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
  onSuccess: (type: string, id: string) => void
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function MeetingForm({ pageCtx, settings, metadata, metaLoading, onSuccess }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [attendees, setAttendees] = useState<string[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Default title to page title
  useEffect(() => {
    setTitle(pageCtx.title || `Meeting notes — ${todayStr()}`)
  }, [pageCtx.title])

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (!settings.token || !settings.appUrl) { setError('Configure your token and app URL in settings'); return }

    setSaving(true)
    setError('')

    try {
      const { id } = await capture(settings, 'meeting_note', {
        meeting_title: title.trim(),
        meeting_date: date,
        attendees,
        projects,
        tags,
        notes: notes.trim() || undefined,
        source_url: pageCtx.url || undefined,
        source_title: pageCtx.title || undefined,
      })
      onSuccess('meeting_note', id)
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Meeting title..."
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Date */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Attendees */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Attendees</label>
        <MultiSelect
          options={metadata.attendees}
          selected={attendees}
          onChange={setAttendees}
          placeholder={metaLoading ? 'Loading...' : 'Select attendees...'}
          allowCustom
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

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
        <MultiSelect
          options={metadata.tags}
          selected={tags}
          onChange={setTags}
          placeholder={metaLoading ? 'Loading...' : 'Select tags...'}
          allowCustom
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Key points, decisions, action items..."
          rows={3}
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
        {saving ? 'Saving…' : 'Save Meeting Note'}
      </button>
    </div>
  )
}
