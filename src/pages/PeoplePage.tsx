import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { RiUserLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Person } from '../types'
import { usePeople, NewPersonInput } from '../hooks/usePeople'
import { useAttendees } from '../hooks/useAttendees'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { SkGridCards } from '../components/ui/Skeleton'

type SortKey = 'recently_viewed' | 'recently_updated' | 'alphabetical' | 'most_mentioned'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recently_viewed',  label: 'Recently viewed' },
  { key: 'recently_updated', label: 'Recently updated' },
  { key: 'alphabetical',     label: 'Alphabetical' },
  { key: 'most_mentioned',   label: 'Most mentioned' },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  if (person.avatar_url) {
    return <img src={person.avatar_url} alt={person.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <div
      className="rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(person.name) || <RiUserLine size={size * 0.5} />}
    </div>
  )
}

export function PeoplePage() {
  const navigate = useNavigate()
  const { people, loading, create } = usePeople()
  const { names: knownAttendees } = useAttendees()

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recently_updated')
  const [nameSuggestOpen, setNameSuggestOpen] = useState(false)

  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({})
  const [recentTags, setRecentTags] = useState<Record<string, string[]>>({})
  const [noteText, setNoteText] = useState<Record<string, string>>({})

  // Create person modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<NewPersonInput>({ name: '', relationship_type: 'coworker' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (people.length === 0) return
    Promise.all([
      supabase.from('person_mentions').select('person_id'),
      supabase.from('person_notes').select('person_id, content, tags, created_at').order('created_at', { ascending: false }),
    ]).then(([{ data: mentions }, { data: notes }]) => {
      const counts: Record<string, number> = {}
      for (const m of mentions ?? []) counts[m.person_id] = (counts[m.person_id] ?? 0) + 1
      setMentionCounts(counts)

      const tags: Record<string, string[]> = {}
      const text: Record<string, string> = {}
      for (const n of notes ?? []) {
        if (!tags[n.person_id]) tags[n.person_id] = []
        for (const t of n.tags ?? []) if (!tags[n.person_id].includes(t) && tags[n.person_id].length < 4) tags[n.person_id].push(t)
        text[n.person_id] = (text[n.person_id] ?? '') + ' ' + n.content
      }
      setRecentTags(tags)
      setNoteText(text)
    })
  }, [people.length])

  const filtered = useMemo(() => {
    let list = people
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.role?.toLowerCase().includes(q) ||
        p.organization?.toLowerCase().includes(q) ||
        p.where_met?.toLowerCase().includes(q) ||
        (noteText[p.id] ?? '').toLowerCase().includes(q) ||
        (recentTags[p.id] ?? []).some(t => t.toLowerCase().includes(q))
      )
    }

    const sorted = [...list]
    if (sort === 'alphabetical') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'recently_updated') sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    else if (sort === 'recently_viewed') sorted.sort((a, b) => (b.last_viewed_at ?? '').localeCompare(a.last_viewed_at ?? ''))
    else if (sort === 'most_mentioned') sorted.sort((a, b) => (mentionCounts[b.id] ?? 0) - (mentionCounts[a.id] ?? 0))
    return sorted
  }, [people, search, sort, mentionCounts, noteText, recentTags])

  const attendeeSuggestions = useMemo(() => {
    const existing = new Set(people.map(p => p.name.trim().toLowerCase()))
    return knownAttendees.filter(name => !existing.has(name.trim().toLowerCase()))
  }, [knownAttendees, people])

  const filteredNameSuggestions = useMemo(() => {
    const q = form.name.trim().toLowerCase()
    const list = q ? attendeeSuggestions.filter(n => n.toLowerCase().includes(q)) : attendeeSuggestions
    return list.slice(0, 6)
  }, [attendeeSuggestions, form.name])

  const openCreate = () => { setForm({ name: '', relationship_type: 'coworker' }); setModalOpen(true) }

  const submit = async () => {
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const { data } = await create(form)
      setModalOpen(false)
      if (data) navigate(`/people/${data.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">People</h1>
          <p className="text-sm text-gray-500">Build a personal knowledge base about the people in your life.</p>
        </div>
        <Button onClick={openCreate}>New Person</Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <Input
          placeholder="Search people and notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px]"
        />
        <Select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="w-44">
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      </div>

      {loading ? (
        <SkGridCards count={6} />
      ) : people.length === 0 ? (
        <EmptyState
          title="No people yet"
          description="Add the people you interact with so you can remember who they are and what matters to them."
          action={{ label: 'New Person', onClick: openCreate }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/people/${p.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <Avatar person={p} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                {p.role && <p className="text-xs text-gray-500 mt-0.5">{p.role}</p>}
                {(recentTags[p.id]?.length ?? 0) > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {recentTags[p.id].map(t => <Badge key={t} variant="indigo">{t}</Badge>)}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1.5">
                  Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Person">
        <div className="space-y-4">
          <div className="relative">
            <Input
              label="Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onFocus={() => setNameSuggestOpen(true)}
              onBlur={() => setTimeout(() => setNameSuggestOpen(false), 100)}
              placeholder="Full name"
              autoFocus
              autoComplete="off"
            />
            {nameSuggestOpen && filteredNameSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border border-gray-200 rounded-lg shadow-sm bg-white max-h-40 overflow-y-auto">
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">From your meeting attendees</p>
                {filteredNameSuggestions.map(name => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, name })); setNameSuggestOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            label="Role / Context (optional)"
            value={form.role ?? ''}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            placeholder="e.g. Senior Front End Engineer, Neighbor, Son's teacher"
          />
          <Input
            label="Organization (optional)"
            value={form.organization ?? ''}
            onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
          />
          <Input
            label="Where We Met (optional)"
            value={form.where_met ?? ''}
            onChange={e => setForm(f => ({ ...f, where_met: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={submitting} disabled={!form.name.trim()}>Create Person</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
