import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry } from '../types'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Textarea'
import { StarRating } from '../components/ui/StarRating'
import { TagInput } from '../components/ui/TagInput'
import { useProjects } from '../hooks/useProjects'
import { useTags } from '../hooks/useTags'
import { Modal } from '../components/ui/Modal'

export function JournalDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { projects: allProjects, create: createProject } = useProjects()
  const { tags: allTags, findOrCreate: findOrCreateTag } = useTags()

  const [_entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [focus, setFocus] = useState('')
  const [accomplished, setAccomplished] = useState('')
  const [needsAttention, setNeedsAttention] = useState('')
  const [reflection, setReflection] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [taskModal, setTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const entryId = useRef<string | null>(null)

  useEffect(() => {
    if (!date) return
    setLoading(true)

    Promise.all([
      supabase.from('journal_entries').select('*').eq('entry_date', date).maybeSingle(),
    ]).then(async ([{ data: je }]) => {
      if (je) {
        entryId.current = je.id
        setEntry(je)
        setFocus(je.focus ?? '')
        setAccomplished(je.accomplished ?? '')
        setNeedsAttention(je.needs_attention ?? '')
        setReflection(je.reflection ?? '')
        setRating(je.productivity_rating)

        const [{ data: jep }, { data: jet }] = await Promise.all([
          supabase.from('journal_entry_projects').select('project_id, projects(name)').eq('journal_entry_id', je.id),
          supabase.from('journal_entry_tags').select('tag_id, tags(name)').eq('journal_entry_id', je.id),
        ])
        setSelectedProjects((jep ?? []).map((r: any) => r.projects?.name).filter(Boolean))
        setSelectedTags((jet ?? []).map((r: any) => r.tags?.name).filter(Boolean))
      }
      setLoading(false)
    })
  }, [date])

  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      user_id: user!.id,
      entry_date: date!,
      focus: focus || null,
      accomplished: accomplished || null,
      needs_attention: needsAttention || null,
      reflection: reflection || null,
      productivity_rating: rating,
      updated_at: new Date().toISOString(),
    }

    let id = entryId.current
    if (!id) {
      const { data } = await supabase.from('journal_entries').insert(payload).select().single()
      id = data?.id
      entryId.current = id!
      setEntry(data)
    } else {
      await supabase.from('journal_entries').update(payload).eq('id', id)
    }

    if (id) {
      await Promise.all([
        supabase.from('journal_entry_projects').delete().eq('journal_entry_id', id),
        supabase.from('journal_entry_tags').delete().eq('journal_entry_id', id),
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

      const projRows = projectIds.filter(Boolean).map(pid => ({
        user_id: user!.id, journal_entry_id: id, project_id: pid,
      }))
      const tagRows = tagIds.filter(Boolean).map(tid => ({
        user_id: user!.id, journal_entry_id: id, tag_id: tid,
      }))
      if (projRows.length) await supabase.from('journal_entry_projects').insert(projRows)
      if (tagRows.length) await supabase.from('journal_entry_tags').insert(tagRows)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      source_type: entryId.current ? 'journal' : 'manual',
      source_id: entryId.current,
    })
    setTaskTitle('')
    setTaskModal(false)
    setAddingTask(false)
  }

  if (loading) return <div className="animate-pulse text-gray-400 text-sm">Loading...</div>

  const displayDate = date ? format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy') : ''

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate('/journal')} className="text-xs text-gray-400 hover:text-indigo-600 transition mb-1">
            ← All entries
          </button>
          <h1 className="text-xl font-bold text-gray-900">{displayDate}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Task</Button>
          <Button onClick={save} loading={saving} size="sm">
            {saved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        <Textarea
          label="Today's focus"
          value={focus}
          onChange={e => setFocus(e.target.value)}
          placeholder="What's the most important thing to accomplish today?"
          rows={2}
        />
        <Textarea
          label="Accomplished"
          value={accomplished}
          onChange={e => setAccomplished(e.target.value)}
          placeholder="What did you get done? What moved forward?"
          rows={4}
        />
        <Textarea
          label="Still needs attention"
          value={needsAttention}
          onChange={e => setNeedsAttention(e.target.value)}
          placeholder="What didn't get done? What's carrying over?"
          rows={3}
        />
        <Textarea
          label="End-of-day reflection"
          value={reflection}
          onChange={e => setReflection(e.target.value)}
          placeholder="How did the day go? What would you do differently?"
          rows={3}
        />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Productivity rating</label>
          <StarRating value={rating} onChange={setRating} />
        </div>

        <TagInput
          label="Projects"
          values={selectedProjects}
          suggestions={allProjects.map(p => p.name)}
          onChange={setSelectedProjects}
          placeholder="Add project..."
        />
        <TagInput
          label="Tags"
          values={selectedTags}
          suggestions={allTags.map(t => t.name)}
          onChange={setSelectedTags}
          placeholder="Add tag..."
        />
      </div>

      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="Add Task">
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
    </div>
  )
}
