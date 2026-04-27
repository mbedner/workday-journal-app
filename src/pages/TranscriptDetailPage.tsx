import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { TagInput } from '../components/ui/TagInput'
import { Modal } from '../components/ui/Modal'
import { useProjects } from '../hooks/useProjects'
import { useTags } from '../hooks/useTags'

export function TranscriptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects: allProjects, create: createProject } = useProjects()
  const { tags: allTags, findOrCreate: findOrCreateTag } = useTags()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [taskModal, setTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const [title, setTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [attendees, setAttendees] = useState('')
  const [summary, setSummary] = useState('')
  const [decisions, setDecisions] = useState('')
  const [actionItems, setActionItems] = useState('')
  const [followUps, setFollowUps] = useState('')
  const [rawTranscript, setRawTranscript] = useState('')
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
      setAttendees(t.attendees ?? '')
      setSummary(t.summary ?? '')
      setDecisions(t.decisions ?? '')
      setActionItems(t.action_items ?? '')
      setFollowUps(t.follow_ups ?? '')
      setRawTranscript(t.raw_transcript ?? '')
      setSelectedProjects((tp ?? []).map((r: any) => r.projects?.name).filter(Boolean))
      setSelectedTags((tt ?? []).map((r: any) => r.tags?.name).filter(Boolean))
      setLoading(false)
    })
  }, [id, navigate])

  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('transcripts').update({
      meeting_title: title || 'Untitled Meeting',
      meeting_date: meetingDate || null,
      attendees: attendees || null,
      summary: summary || null,
      decisions: decisions || null,
      action_items: actionItems || null,
      follow_ups: followUps || null,
      raw_transcript: rawTranscript || null,
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

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDelete = async () => {
    await supabase.from('transcripts').delete().eq('id', id!)
    navigate('/transcripts')
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
  }

  if (loading) return <div className="animate-pulse text-gray-400 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate('/transcripts')} className="text-xs text-gray-400 hover:text-indigo-600 transition mb-1">
            ← All transcripts
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{title || 'Untitled Meeting'}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Task from action item</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>Delete</Button>
          <Button size="sm" onClick={save} loading={saving}>{saved ? '✓ Saved' : 'Save'}</Button>
        </div>
      </div>

      <div className="space-y-5">
        <Input label="Meeting title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Meeting date" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
          <Input label="Attendees" value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="Names or roles" />
        </div>
        <TagInput label="Projects" values={selectedProjects} suggestions={allProjects.map(p => p.name)} onChange={setSelectedProjects} placeholder="Add project..." />
        <TagInput label="Tags" values={selectedTags} suggestions={allTags.map(t => t.name)} onChange={setSelectedTags} placeholder="Add tag..." />
        <Textarea label="Summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="High-level summary of the meeting..." rows={3} />
        <Textarea label="Decisions" value={decisions} onChange={e => setDecisions(e.target.value)} placeholder="Key decisions made..." rows={3} />
        <Textarea label="Action items" value={actionItems} onChange={e => setActionItems(e.target.value)} placeholder="Specific tasks or action items..." rows={3} />
        <Textarea label="Follow-ups" value={followUps} onChange={e => setFollowUps(e.target.value)} placeholder="Questions, blockers, or items to follow up on..." rows={2} />
        <Textarea label="Raw transcript" value={rawTranscript} onChange={e => setRawTranscript(e.target.value)} placeholder="Paste full transcript here..." rows={10} className="font-mono text-xs" />
      </div>

      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="Add task from action item">
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

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete transcript?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This will permanently delete this transcript and all associated data.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
