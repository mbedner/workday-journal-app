import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiArrowLeftLine, RiPencilLine, RiSparklingLine } from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { JournalEntry } from '../types'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { TagInput } from '../components/ui/TagInput'
import { Badge } from '../components/ui/Badge'
import { MarkdownContent } from '../components/ui/MarkdownContent'
import { RichTextEditor } from '../components/ui/RichTextEditor'
import { AiCleanupModal } from '../components/ui/AiCleanupModal'
import { Sk } from '../components/ui/Skeleton'
import { useProjects } from '../hooks/useProjects'
import { useTags } from '../hooks/useTags'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../contexts/ToastContext'

type CleanupField = 'focus' | 'accomplished' | 'needsAttention' | 'reflection'

export function JournalDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { projects: allProjects, create: createProject } = useProjects()
  const { tags: allTags, findOrCreate: findOrCreateTag } = useTags()

  const [_entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

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

  const [cleanupField, setCleanupField] = useState<CleanupField | null>(null)
  const cleanupValue = cleanupField === 'focus' ? focus
    : cleanupField === 'accomplished' ? accomplished
    : cleanupField === 'needsAttention' ? needsAttention
    : cleanupField === 'reflection' ? reflection : ''

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
        // Existing entry — view mode by default
        setIsEditing(false)

        const [{ data: jep }, { data: jet }] = await Promise.all([
          supabase.from('journal_entry_projects').select('project_id, projects(name)').eq('journal_entry_id', je.id),
          supabase.from('journal_entry_tags').select('tag_id, tags(name)').eq('journal_entry_id', je.id),
        ])
        setSelectedProjects((jep ?? []).map((r: any) => r.projects?.name).filter(Boolean))
        setSelectedTags((jet ?? []).map((r: any) => r.tags?.name).filter(Boolean))
      } else {
        // New entry — start in edit mode
        setIsEditing(true)
      }
      setLoading(false)
    })
  }, [date])

  const save = async () => {
    setSaving(true)
    try {
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

      addToast('Journal saved', 'success')
      setIsEditing(false)
    } catch {
      addToast('Failed to save', 'error')
    } finally {
      setSaving(false)
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
      source_type: entryId.current ? 'journal' : 'manual',
      source_id: entryId.current,
    })
    setTaskTitle('')
    setTaskModal(false)
    setAddingTask(false)
    addToast('Task added', 'success')
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-2.5 w-20" />
        <Sk className="h-8 w-72" />
        <Sk className="h-4 w-32 rounded-full" />
      </div>
      {['h-24', 'h-28', 'h-20', 'h-20'].map((h, i) => (
        <div key={i} className="space-y-2">
          <Sk className="h-2.5 w-28" />
          <Sk className={`${h} w-full`} />
        </div>
      ))}
    </div>
  )

  const displayDate = date ? format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy') : ''
  const hasContent = focus || accomplished || needsAttention || reflection

  // View mode
  if (!isEditing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => navigate('/journal')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-1"
            >
              <RiArrowLeftLine size={13} /> All entries
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{displayDate}</h1>
              {rating !== null && <StarRating value={rating} readonly />}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Task</Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
              <RiPencilLine size={14} className="mr-1" /> Edit
            </Button>
          </div>
        </div>

        {/* Content */}
        {!hasContent ? (
          <p className="text-sm text-gray-400 italic">Nothing written yet — click Edit to add an entry.</p>
        ) : (
          <div className="space-y-5">
            {focus && (
              <div>
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">Today's focus</p>
                <MarkdownContent content={focus} className="prose-p:text-indigo-900 prose-p:font-medium" />
              </div>
            )}
            {accomplished && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Accomplished</p>
                <MarkdownContent content={accomplished} />
              </div>
            )}
            {needsAttention && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Still needs attention</p>
                <MarkdownContent content={needsAttention} />
              </div>
            )}
            {reflection && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">End-of-day reflection</p>
                <MarkdownContent content={reflection} className="prose-p:italic prose-p:text-gray-600" />
              </div>
            )}
          </div>
        )}

        {/* Projects & Tags */}
        {(selectedProjects.length > 0 || selectedTags.length > 0) && (
          <div className="pt-4 border-t border-gray-100 space-y-3">
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

  // Edit mode
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate('/journal')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-1">
            <RiArrowLeftLine size={13} /> All entries
          </button>
          <h1 className="text-xl font-bold text-gray-900">{displayDate}</h1>
        </div>
        <div className="flex gap-2">
          {entryId.current && (
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setTaskModal(true)}>+ Task</Button>
          <Button onClick={save} loading={saving} size="sm">Save</Button>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <RichTextEditor
            label="Today's focus"
            value={focus}
            onChange={setFocus}
            placeholder="What's the most important thing to accomplish today?"
            minHeight={90}
          />
          {focus && <CleanupButton onClick={() => setCleanupField('focus')} />}
        </div>
        <div>
          <RichTextEditor
            label="Accomplished"
            value={accomplished}
            onChange={setAccomplished}
            placeholder="What did you get done? What moved forward?"
            minHeight={140}
          />
          {accomplished && <CleanupButton onClick={() => setCleanupField('accomplished')} />}
        </div>
        <div>
          <RichTextEditor
            label="Still needs attention"
            value={needsAttention}
            onChange={setNeedsAttention}
            placeholder="What didn't get done? What's carrying over?"
            minHeight={110}
          />
          {needsAttention && <CleanupButton onClick={() => setCleanupField('needsAttention')} />}
        </div>
        <div>
          <RichTextEditor
            label="End-of-day reflection"
            value={reflection}
            onChange={setReflection}
            placeholder="How did the day go? What would you do differently?"
            minHeight={110}
          />
          {reflection && <CleanupButton onClick={() => setCleanupField('reflection')} />}
        </div>

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

      <AiCleanupModal
        open={cleanupField !== null}
        onClose={() => setCleanupField(null)}
        original={cleanupValue}
        onReplace={text => {
          if (cleanupField === 'focus')         setFocus(text)
          if (cleanupField === 'accomplished')  setAccomplished(text)
          if (cleanupField === 'needsAttention') setNeedsAttention(text)
          if (cleanupField === 'reflection')    setReflection(text)
        }}
      />
    </div>
  )
}

function CleanupButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition"
    >
      <RiSparklingLine size={12} />
      Clean up writing
    </button>
  )
}
