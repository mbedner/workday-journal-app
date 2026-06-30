import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  RiArrowLeftLine,
  RiPencilLine,
  RiAddLine,
  RiBookOpenLine,
  RiFileList3Line,
  RiDeleteBinLine,
  RiSparklingLine,
  RiRefreshLine,
  RiCloseLine,
  RiUserLine,
} from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Person, PersonNote, PersonRelationship, RelationshipType } from '../types'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { TagInput } from '../components/ui/TagInput'
import { EmptyState } from '../components/ui/EmptyState'
import { Sk } from '../components/ui/Skeleton'
import { Avatar } from '../components/ui/Avatar'
import { useToast } from '../contexts/ToastContext'
import { usePeople } from '../hooks/usePeople'

const TAG_SUGGESTIONS = ['Family', 'Kids', 'Career', 'Interests', 'Travel', 'Communication', 'Favorites', 'Goals', 'Stressors', 'Miscellaneous']
const RELATIONSHIP_LABEL_SUGGESTIONS = ['Manages', 'Reports to', 'Works with', 'Mentor', 'Mentee', 'Peer', 'Client', 'Vendor', 'Friend']

interface JournalMention { id: string; entry_date: string; focus: string | null }
interface MeetingMention { id: string; meeting_title: string; meeting_date: string | null }

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { people: allPeople } = usePeople()

  const [person,  setPerson]  = useState<Person | null>(null)
  const [notes,   setNotes]   = useState<PersonNote[]>([])
  const [loading, setLoading] = useState(true)

  const [journalMentions, setJournalMentions] = useState<JournalMention[]>([])
  const [meetingMentions, setMeetingMentions] = useState<MeetingMention[]>([])

  // Edit person modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<{ name: string; relationship_type: RelationshipType; role: string; organization: string; where_met: string; avatar_url: string }>(
    { name: '', relationship_type: 'coworker', role: '', organization: '', where_met: '', avatar_url: '' }
  )
  const [saving, setSaving] = useState(false)

  // Snapshot generation
  const [snapshotGenerating, setSnapshotGenerating] = useState(false)

  // Relationships
  const [relationships, setRelationships] = useState<PersonRelationship[]>([])
  const [relLabel, setRelLabel] = useState('')
  const [relPersonId, setRelPersonId] = useState('')
  const [relSaving, setRelSaving] = useState(false)

  // Note composer
  const [noteText, setNoteText] = useState('')
  const [noteTags, setNoteTags] = useState<string[]>([])
  const [noteSaving, setNoteSaving] = useState(false)
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    const [{ data: p }, { data: n }, { data: mentions }, { data: rels }] = await Promise.all([
      supabase.from('people').select('*').eq('id', id).single(),
      supabase.from('person_notes').select('*').eq('person_id', id).order('created_at', { ascending: false }),
      supabase.from('person_mentions').select('source_type, source_id').eq('person_id', id),
      supabase.from('person_relationships').select('*, related_person:people!person_relationships_related_person_id_fkey(id, name, role)').eq('person_id', id).order('label'),
    ])
    if (!p) { navigate('/people'); return }
    setPerson(p)
    setNotes(n ?? [])
    setRelationships((rels ?? []) as PersonRelationship[])

    const journalIds = (mentions ?? []).filter(m => m.source_type === 'journal').map(m => m.source_id)
    const meetingIds  = (mentions ?? []).filter(m => m.source_type === 'meeting').map(m => m.source_id)

    const [jm, mm] = await Promise.all([
      journalIds.length
        ? supabase.from('journal_entries').select('id, entry_date, focus').in('id', journalIds).order('entry_date', { ascending: false })
        : Promise.resolve({ data: [] }),
      meetingIds.length
        ? supabase.from('transcripts').select('id, meeting_title, meeting_date').in('id', meetingIds).order('meeting_date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    setJournalMentions((jm.data ?? []) as JournalMention[])
    setMeetingMentions((mm.data ?? []) as MeetingMention[])

    setLoading(false)
    supabase.from('people').update({ last_viewed_at: new Date().toISOString() }).eq('id', id).then(() => {})
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = () => {
    if (!person) return
    setEditForm({
      name: person.name,
      relationship_type: person.relationship_type,
      role: person.role ?? '',
      organization: person.organization ?? '',
      where_met: person.where_met ?? '',
      avatar_url: person.avatar_url ?? '',
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!person || !editForm.name.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('people')
        .update({
          name: editForm.name.trim(),
          relationship_type: editForm.relationship_type,
          role: editForm.role || null,
          organization: editForm.organization || null,
          where_met: editForm.where_met || null,
          avatar_url: editForm.avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', person.id)
        .select().single()
      if (error) throw error
      setPerson(data)
      setEditOpen(false)
      addToast('Person updated', 'success')
    } catch {
      addToast('Failed to update', 'error')
    } finally {
      setSaving(false)
    }
  }

  const generateSnapshot = async () => {
    if (!person || notes.length === 0) return
    setSnapshotGenerating(true)
    try {
      const res = await fetch('/api/ai/person-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: person.name,
          notes: notes.map(n => n.content),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate')

      const snapshot = { summary: data.summary, generated_at: new Date().toISOString() }
      const { data: updated, error } = await supabase
        .from('people')
        .update({ snapshot, updated_at: new Date().toISOString() })
        .eq('id', person.id)
        .select().single()
      if (error) throw error
      setPerson(updated)
      addToast('Snapshot generated', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate snapshot', 'error')
    } finally {
      setSnapshotGenerating(false)
    }
  }

  const saveNote = async () => {
    if (!person || !noteText.trim()) return
    setNoteSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('person_notes')
        .insert({ person_id: person.id, user_id: user!.id, content: noteText.trim(), tags: noteTags })
        .select().single()
      if (error) throw error
      setNotes(prev => [data, ...prev])
      setNoteText('')
      setNoteTags([])
      await supabase.from('people').update({ updated_at: new Date().toISOString() }).eq('id', person.id)
      setPerson(p => p ? { ...p, updated_at: new Date().toISOString() } : p)
    } catch {
      addToast('Failed to save note', 'error')
    } finally {
      setNoteSaving(false)
    }
  }

  const deleteNote = async () => {
    if (!deleteNoteId) return
    try {
      await supabase.from('person_notes').delete().eq('id', deleteNoteId)
      setNotes(prev => prev.filter(n => n.id !== deleteNoteId))
      addToast('Note deleted', 'success')
    } catch {
      addToast('Failed to delete note', 'error')
    } finally {
      setDeleteNoteId(null)
    }
  }

  const addRelationship = async () => {
    if (!person || !relLabel.trim() || !relPersonId) return
    setRelSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('person_relationships')
        .insert({ user_id: user!.id, person_id: person.id, related_person_id: relPersonId, label: relLabel.trim() })
        .select('*, related_person:people!person_relationships_related_person_id_fkey(id, name, role)')
        .single()
      if (error) throw error
      setRelationships(prev => [...prev, data as PersonRelationship].sort((a, b) => a.label.localeCompare(b.label)))
      setRelLabel('')
      setRelPersonId('')
    } catch (err: any) {
      addToast(err?.code === '23505' ? 'That relationship already exists' : 'Failed to add relationship', 'error')
    } finally {
      setRelSaving(false)
    }
  }

  const removeRelationship = async (relId: string) => {
    try {
      await supabase.from('person_relationships').delete().eq('id', relId)
      setRelationships(prev => prev.filter(r => r.id !== relId))
    } catch {
      addToast('Failed to remove relationship', 'error')
    }
  }

  const notesByDate = useMemo(() => {
    const groups: { date: string; notes: PersonNote[] }[] = []
    for (const n of notes) {
      const date = format(new Date(n.created_at), 'MMMM d, yyyy')
      const existing = groups.find(g => g.date === date)
      if (existing) existing.notes.push(n)
      else groups.push({ date, notes: [n] })
    }
    return groups
  }, [notes])

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <Sk className="h-4 w-24" />
      <div className="flex gap-4">
        <Sk className="h-16 w-16 rounded-full" />
        <div className="space-y-2 flex-1"><Sk className="h-6 w-48" /><Sk className="h-3 w-64" /></div>
      </div>
    </div>
  )
  if (!person) return null

  const hasSnapshot = !!person.snapshot?.summary

  return (
    <div className="space-y-8">
      <Link to="/people" className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition">
        <RiArrowLeftLine size={13} /> All people
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <Avatar person={person} size={64} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{person.name}</h1>
            {person.role && <p className="text-sm text-gray-500 mt-0.5">{person.role}</p>}
            <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
              {person.organization && <span>{person.organization}</span>}
              {person.where_met && <span>Met: {person.where_met}</span>}
              <span>Updated {formatDistanceToNow(new Date(person.updated_at), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openEdit}>
            <RiPencilLine size={14} /> Edit
          </Button>
        </div>
      </div>

      {/* Snapshot */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Snapshot</h2>
          {notes.length > 0 && (
            <button
              onClick={generateSnapshot}
              disabled={snapshotGenerating}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {snapshotGenerating
                ? <><RiRefreshLine size={12} className="animate-spin" /> Generating…</>
                : hasSnapshot
                  ? <><RiRefreshLine size={12} /> Regenerate</>
                  : <><RiSparklingLine size={12} /> Generate with AI</>
              }
            </button>
          )}
        </div>
        {hasSnapshot ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">{person.snapshot!.summary}</p>
            {person.snapshot!.generated_at && (
              <p className="text-xs text-gray-400">
                Generated {formatDistanceToNow(new Date(person.snapshot!.generated_at), { addSuffix: true })}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-gray-400">
              {notes.length === 0
                ? 'Add notes below to generate an AI snapshot.'
                : 'No snapshot yet — click "Generate with AI" to summarize your notes.'}
            </p>
          </div>
        )}
      </section>

      {/* Notes */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Notes</h2>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
          <Textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="What would you like to remember?"
            rows={2}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote() }
            }}
          />
          <TagInput values={noteTags} onChange={setNoteTags} suggestions={TAG_SUGGESTIONS} placeholder="Add tags (optional)..." />
          <div className="flex justify-end">
            <Button onClick={saveNote} loading={noteSaving} disabled={!noteText.trim()} size="sm">
              <RiAddLine size={14} /> Add note
            </Button>
          </div>
        </div>

        {notesByDate.length === 0 ? (
          <EmptyState title="No notes yet" description="Capture small things worth remembering after conversations." />
        ) : (
          <div className="space-y-5">
            {notesByDate.map(group => (
              <div key={group.date}>
                <p className="text-xs font-medium text-gray-400 mb-2">{group.date}</p>
                <div className="space-y-2">
                  {group.notes.map(n => (
                    <div key={n.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-800 leading-relaxed flex-1">{n.content}</p>
                        <button
                          onClick={() => setDeleteNoteId(n.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition shrink-0"
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      </div>
                      {n.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {n.tags.map(t => <Badge key={t} variant="indigo">{t}</Badge>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Relationships */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Connections</h2>
        <div className="space-y-4">
          {/* Add relationship form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <div className="w-full sm:w-40 shrink-0">
                <Input
                  list="rel-label-suggestions"
                  value={relLabel}
                  onChange={e => setRelLabel(e.target.value)}
                  placeholder="Relationship…"
                />
                <datalist id="rel-label-suggestions">
                  {RELATIONSHIP_LABEL_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <select
                value={relPersonId}
                onChange={e => setRelPersonId(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select person…</option>
                {allPeople.filter(p => p.id !== id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>
                ))}
              </select>
              <Button
                onClick={addRelationship}
                loading={relSaving}
                disabled={!relLabel.trim() || !relPersonId}
                variant="secondary"
                size="sm"
              >
                <RiAddLine size={14} /> Add
              </Button>
            </div>
          </div>

          {/* Existing relationships grouped by label */}
          {relationships.length > 0 && (() => {
            const groups = new Map<string, PersonRelationship[]>()
            for (const r of relationships) {
              if (!groups.has(r.label)) groups.set(r.label, [])
              groups.get(r.label)!.push(r)
            }
            return (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {Array.from(groups.entries()).map(([label, rels]) => (
                  <div key={label} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-semibold text-gray-500 w-28 shrink-0 pt-0.5">{label}</span>
                    <div className="flex flex-wrap gap-2 flex-1">
                      {rels.map(r => (
                        <div key={r.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg pl-2 pr-1 py-0.5 group">
                          <RiUserLine size={11} className="text-gray-400 shrink-0" />
                          <Link to={`/people/${r.related_person_id}`} className="text-sm text-gray-800 hover:text-indigo-600 transition">
                            {r.related_person?.name ?? '—'}
                          </Link>
                          {r.related_person?.role && (
                            <span className="text-xs text-gray-400 hidden sm:inline">{r.related_person.role}</span>
                          )}
                          <button
                            onClick={() => removeRelationship(r.id)}
                            className="ml-0.5 p-0.5 text-gray-300 hover:text-red-500 transition rounded"
                            aria-label="Remove"
                          >
                            <RiCloseLine size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </section>

      {/* Mentions */}
      {(journalMentions.length > 0 || meetingMentions.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Mentions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {journalMentions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><RiBookOpenLine size={13} /> Journal Mentions</p>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {journalMentions.map(j => (
                    <Link key={j.id} to={`/journal/${j.entry_date}`} className="block px-4 py-2.5 hover:bg-indigo-50/60 transition-colors">
                      <p className="text-xs text-gray-400">{format(new Date(j.entry_date + 'T12:00:00'), 'MMM d, yyyy')}</p>
                      {j.focus && <p className="text-sm text-gray-700 truncate mt-0.5">{j.focus.replace(/<[^>]+>/g, ' ').trim()}</p>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {meetingMentions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><RiFileList3Line size={13} /> Meeting Mentions</p>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {meetingMentions.map(m => (
                    <Link key={m.id} to={`/transcripts/${m.id}`} className="block px-4 py-2.5 hover:bg-indigo-50/60 transition-colors">
                      <p className="text-sm text-gray-700 truncate">{m.meeting_title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.meeting_date && <p className="text-xs text-gray-400">{m.meeting_date}</p>}
                        <Badge variant="gray">Attendee</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Edit person modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit person">
        <div className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          <Input label="Title (optional)" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} />
          <Input label="Organization (optional)" value={editForm.organization} onChange={e => setEditForm(f => ({ ...f, organization: e.target.value }))} />
          <Input label="Where We Met (optional)" value={editForm.where_met} onChange={e => setEditForm(f => ({ ...f, where_met: e.target.value }))} />
          <Input label="Avatar URL (optional)" value={editForm.avatar_url} onChange={e => setEditForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} loading={saving} disabled={!editForm.name.trim()}>Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete note confirmation */}
      <Modal open={!!deleteNoteId} onClose={() => setDeleteNoteId(null)} title="Delete note?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This note will be permanently deleted.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteNoteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={deleteNote}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
