import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { PageContext, Settings, Metadata } from './types'
import { SourcePreview } from './SourcePreview'
import { MultiSelect } from './MultiSelect'
import { capture } from './api'

export interface MeetingFormHandle {
  submit: () => Promise<void>
}

interface Props {
  pageCtx: PageContext
  settings: Settings
  metadata: Metadata
  metaLoading: boolean
  onSaving: (v: boolean) => void
  onError: (msg: string) => void
  onSuccess: (type: string, id: string) => void
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export const MeetingForm = forwardRef<MeetingFormHandle, Props>(
  ({ pageCtx, settings, metadata, metaLoading, onSaving, onError, onSuccess }, ref) => {
    const [title, setTitle] = useState('')
    const [date, setDate] = useState(todayStr())
    const [attendees, setAttendees] = useState<string[]>([])
    const [projects, setProjects] = useState<string[]>([])
    const [tags, setTags] = useState<string[]>([])
    const [notes, setNotes] = useState('')

    // Leave title blank — don't assume the page title is a useful meeting title
    useEffect(() => {}, [])

    useImperativeHandle(ref, () => ({
      submit: async () => {
        if (!title.trim()) { onError('Title is required'); return }
        if (!settings.token || !settings.appUrl) { onError('Configure your token and app URL in settings'); return }

        onSaving(true)
        onError('')

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
          onError(err.message ?? 'Failed to save. Check your settings.')
        } finally {
          onSaving(false)
        }
      },
    }))

    const field = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition placeholder:text-gray-300'
    const label = 'block text-xs font-medium text-gray-500 mb-1'

    return (
      <div className="space-y-3 py-1">
        <div>
          <label className={label}>Meeting Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title…" className={field} autoFocus />
        </div>

        <div>
          <label className={label}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
        </div>

        <div>
          <label className={label}>Attendees</label>
          <MultiSelect
            options={metadata.attendees}
            selected={attendees}
            onChange={setAttendees}
            placeholder={metaLoading ? 'Loading…' : 'Select or type names…'}
            allowCustom
          />
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
          <label className={label}>Tags</label>
          <MultiSelect
            options={metadata.tags}
            selected={tags}
            onChange={setTags}
            placeholder={metaLoading ? 'Loading…' : 'Select or type tags…'}
            allowCustom
          />
        </div>

        <div>
          <label className={label}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Key points, decisions, action items…"
            rows={3}
            className={field}
          />
        </div>

        <SourcePreview url={pageCtx.url} title={pageCtx.title} />
      </div>
    )
  }
)

MeetingForm.displayName = 'MeetingForm'
