import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiArrowLeftLine, RiPencilLine, RiSparklingLine } from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { TagInput } from '../components/ui/TagInput'
import { RichTextEditor } from '../components/ui/RichTextEditor'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { MarkdownContent } from '../components/ui/MarkdownContent'
import { AiCleanupModal } from '../components/ui/AiCleanupModal'
import { ExtractActionsModal, TaskPayload } from '../components/ui/ExtractActionsModal'
import { summarizeMeeting } from '../lib/ai'
import { Sk } from '../components/ui/Skeleton'
import { useProjects } from '../hooks/useProjects'
import { useTags } from '../hooks/useTags'
import { useAttendees } from '../hooks/useAttendees'
import { useToast } from '../contexts/ToastContext'

export function TranscriptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { projects: allProjects, create: createProject } = useProjects()
  const { tags: allTags, findOrCreate: findOrCreateTag } = useTags()
  const { names: knownAttendees, syncNames: syncAttendees } = useAttendees()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [taskModal, setTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [extractModal, setExtractModal] = useState(false)
  const [cleanupModal, setCleanupModal] = useState(false)

  const [title, setTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('transcripts').select('*').eq('id', id).single(),
      supabase.from('transcript_projects').select('project_id, projects(name)').eq('transcript_id', id),
      supabase.from('transcript_tags').select('tag_id, tags(name)').eq('transcript_id', id),
    ]).then(([{ data: t }, { data: tp }, { data: tt }]) => {
      if (!t) { navigate('/transcripts'); return }
      setTitle(t.meeting_title)
      setMeetingDate(t.meeting_date ?? '')
      setAttendees(t.attendees ? t.attendees.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
      setSummary(t.summary ?? '')
      // If raw_transcript is HTML (saved by the rich-text editor), use it directly.
      // Otherwise fall back to combining the old structured fields with markdown headings.
      if (t.raw_transcript && t.raw_transcript.trim().startsWith('<')) {
        setContent(t.raw_transcript)
      } else {
        const parts = [
          t.summary        && `## Summary\n${t.summary}`,
          t.decisions      && `## Decisions\n${t.decisions}`,
          t.action_items   && `## Action Items\n${t.action_items}`,
          t.follow_ups     && `## Follow-ups\n${t.follow_ups}`,
          t.raw_transcript && `## Meeting Notes\n${t.raw_transcript}`,
        ].filter(Boolean)
        setContent(parts.length > 0 ? parts.join('\n\n') : '')
      }
      setSelectedProjects((tp ?? []).map((r: any) => r.projects?.name).filter(Boolean))
      setSelectedTags((tt ?? []).map((r: any) => r.tags?.name).filter(Boolean))
      // Existing transcript — view mode by default
      const isNew = t.meeting_title === 'New Meeting' && !t.raw_transcript && !t.summary
      setIsEditing(isNew)
      setLoading(false)
    })
  }, [id, navigate])

  const save = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('transcripts').update({
        meeting_title: title || 'Untitled Meeting',
        meeting_date: meetingDate || null,
        attendees: attendees.length ? attendees.join(', ') : null,
        raw_transcript: content || null,
        // Clear old structured fields — content lives in raw_transcript now
        // summary is preserved (AI-generated executive summary)
        decisions: null,
        action_items: null,
        follow_ups: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id!)

      await Promise.all([
        supabase.from('transcript_projects').delete().eq('transcript_id', id!),
        supabase.from('transcript_tags').delete().eq('transcript_id', id!),
      ])

      const projectIds = await Promise.all(
        selectedProjects.map(async name => {
          let proj = allProjects.find(p => p.name === name)
          if (!proj) { const { data } = await createProject(name); proj = data }
          return proj?.id
        })
      )
      const tagIds = await Promise.all(
        selectedTags.map(async name => {
          const tag = await findOrCreateTag(name)
          return tag?.id
        })
      )

      const projRows = projectIds.filter(Boolean).map(pid => ({ user_id: user!.id, transcript_id: id!, project_id: pid }))
      const tagRows = tagIds.filter(Boolean).map(tid => ({ user_id: user!.id, transcript_id: id!, tag_id: tid }))
      if (projRows.length) await supabase.from('transcript_projects').insert(projRows)
      if (tagRows.length) await supabase.from('transcript_tags').insert(tagRows)

      // Persist new attendee names so they appear in future suggestions
      if (attendees.length) await syncAttendees(attendees)

      addToast('Saved', 'success')
      setIsEditing(false)
    } catch {
      addToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    await supabase.from('transcripts').update({ archived_at: new Date().toISOString() }).eq('id', id!)
    navigate('/transcripts')
  }

  const generateSummary = async () => {
    if (!content.trim()) return
    setSummarizing(true)
    try {
      const { summary: text } = await summarizeMeeting(content)
      setSummary(text)
      await supabase.from('transcripts').update({ summary: text, updated_at: new Date().toISOString() }).eq('id', id!)
      addToast('Summary generated', 'success')
    } catch (e: any) {
      addToast(e.message ?? 'Failed to generate summary', 'error')
    } finally {
      setSummarizing(false)
    }
  }

  const addTask = async () => {
    if (!taskTitle.trim()) return
    setAddingTask(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tasks').insert({
      user_id: user!.id,
      title: taskTitle.trim(),
      status: 'todo',
      priority: 'medium',
      source_type: 'transcript',
      source_id: id,
    })
    setTaskTitle('')
    setTaskModal(false)
    setAddingTask(false)
    addToast('Task added', 'success')
  }

  const addTasksBulk = async (tasks: TaskPayload[]) => {
    const { data: { user } } = await supabase.auth.getUser()

    // Resolve project IDs for the transcript's associated projects
    const projectIds = (await Promise.all(
      selectedProjects.map(async name => {
        let proj = allProjects.find(p => p.name === name)
        if (!proj) { const { data } = await createProject(name); proj = data }
        return proj?.id
      })
    )).filter(Boolean) as string[]

    // Insert all tasks and collect their IDs
    const { data: inserted } = await supabase.from('tasks').insert(
      tasks.map(({ title, notes }) => ({
        user_id: user!.id,
        title,
        notes: notes || null,
        status: 'todo',
        priority: 'medium',
        source_type: 'transcript',
        source_id: id,
      }))
    ).select('id')

    // Link each new task to the transcript's projects
    if (projectIds.length && inserted?.length) {
      const rows = inserted.flatMap(({ id: taskId }) =>
        projectIds.map(pid => ({ user_id: user!.id, task_id: taskId, project_id: pid }))
      )
      await supabase.from('task_projects').insert(rows)
    }

    addToast(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} added`, 'success')
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-2.5 w-28" />
        <Sk className="h-8 w-80" />
        <Sk className="h-3 w-48" />
      </div>
      <div className="space-y-1.5">
        {[...Array(12)].map((_, i) => (
          <Sk key={i} className={`h-3 ${i % 4 === 3 ? 'w-3/5' : 'w-full'}`} />
        ))}
      </div>
    </div>
  )

  // View mode
  if (!isEditing) {
    const formattedDate = meetingDate
      ? (() => { try { return format(new Date(meetingDate + 'T12:00:00'), 'MMMM d, yyyy') } catch { return meetingDate } })()
      : null

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => navigate('/transcripts')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-1"
            >
              <RiArrowLeftLine size={13} /> All meeting notes
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{title || 'Untitled Meeting'}</h1>
            {(formattedDate || attendees.length > 0) && (
              <p className="text-sm text-gray-400 mt-1">
                {[formattedDate, attendees.join(', ')].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => setExtractModal(true)}>
              <RiSparklingLine size={14} className="mr-1" /> Extract actions
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Add task</Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
              <RiPencilLine size={14} className="mr-1" /> Edit
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>Delete</Button>
          </div>
        </div>

        {/* Projects & Tags */}
        {(selectedProjects.length > 0 || selectedTags.length > 0) && (
          <div className="space-y-3">
            {selectedProjects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Projects</p>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedProjects.map(p => <Badge key={p} variant="indigo">{p}</Badge>)}
                </div>
              </div>
            )}
            {selectedTags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Tags</p>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedTags.map(t => <Badge key={t} variant="gray">{t}</Badge>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Executive summary */}
        {summary ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                <RiSparklingLine size={13} className="text-indigo-500" />
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Summary</p>
              </div>
              <button
                onClick={generateSummary}
                disabled={summarizing || !content}
                className="text-xs text-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 shrink-0"
              >
                {summarizing ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
          </div>
        ) : content ? (
          <div className="flex items-center gap-2">
            <button
              onClick={generateSummary}
              disabled={summarizing}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition disabled:opacity-40"
            >
              <RiSparklingLine size={13} />
              {summarizing ? 'Generating summary…' : 'Generate executive summary'}
            </button>
          </div>
        ) : null}

        {/* Content */}
        {content ? (
          <MarkdownContent content={content} />
        ) : (
          <p className="text-sm text-gray-400 italic">No notes yet — click Edit to add content.</p>
        )}

        {/* Task modal */}
        <Modal open={taskModal} onClose={() => setTaskModal(false)} title="Add task">
          <div className="space-y-4">
            <input
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask() }}
              placeholder="Task title..."
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTaskModal(false)}>Cancel</Button>
              <Button onClick={addTask} loading={addingTask} disabled={!taskTitle.trim()}>Add Task</Button>
            </div>
          </div>
        </Modal>

        {/* Archive modal */}
        <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Archive meeting note?">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">This meeting note will be archived and permanently deleted after 90 days. You can restore it from the Archive.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Archive</Button>
            </div>
          </div>
        </Modal>

        {/* AI modals */}
        <ExtractActionsModal
          open={extractModal}
          onClose={() => setExtractModal(false)}
          transcript={content}
          onAddTasks={addTasksBulk}
        />
        <AiCleanupModal
          open={cleanupModal}
          onClose={() => setCleanupModal(false)}
          original={content}
          onReplace={setContent}
        />
      </div>
    )
  }

  // Edit mode
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate('/transcripts')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-1">
            <RiArrowLeftLine size={13} /> All meeting notes
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{title || 'Untitled Meeting'}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Add task</Button>
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>Delete</Button>
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>

      <div className="space-y-5">
        <Input label="Meeting title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Date" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
        </div>
        <TagInput
          label="Attendees"
          values={attendees}
          suggestions={knownAttendees}
          onChange={setAttendees}
          placeholder="Add attendee…"
        />
        <TagInput label="Projects" values={selectedProjects} suggestions={allProjects.map(p => p.name)} onChange={setSelectedProjects} placeholder="Add project..." />
        <TagInput label="Tags" values={selectedTags} suggestions={allTags.map(t => t.name)} onChange={setSelectedTags} placeholder="Add tag..." />
        <div>
          <RichTextEditor
            label="Notes"
            value={content}
            onChange={setContent}
            placeholder="Paste your AI summary, transcript, decisions, action items — whatever you need..."
            minHeight={400}
          />
          {content && (
            <button
              type="button"
              onClick={() => setCleanupModal(true)}
              className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition"
            >
              <RiSparklingLine size={12} /> Clean up writing
            </button>
          )}
        </div>
      </div>

      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="Add task">
        <div className="space-y-4">
          <input
            value={taskTitle}
            onChange={e => setTaskTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask() }}
            placeholder="Task title..."
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTaskModal(false)}>Cancel</Button>
            <Button onClick={addTask} loading={addingTask} disabled={!taskTitle.trim()}>Add Task</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Archive meeting note?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This meeting note will be archived and permanently deleted after 90 days. You can restore it from the Archive.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Archive</Button>
          </div>
        </div>
      </Modal>

      <AiCleanupModal
        open={cleanupModal}
        onClose={() => setCleanupModal(false)}
        original={content}
        onReplace={setContent}
      />
    </div>
  )
}
