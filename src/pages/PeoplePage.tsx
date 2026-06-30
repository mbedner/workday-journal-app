import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { RiArrowRightSLine } from '@remixicon/react'
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
import { Avatar } from '../components/ui/Avatar'
import { SkGridCards, SkListCard } from '../components/ui/Skeleton'
import { FilterSheet, FilterTrigger, FilterRow } from '../components/ui/FilterSheet'
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle'

type SortKey = 'recently_viewed' | 'recently_updated' | 'alphabetical' | 'most_mentioned'
type GroupBy = 'none' | 'tag' | 'recency' | 'alphabet'

const RECENCY_ORDER = ['Updated this week', 'Updated this month', 'Older']

function recencyBucket(updatedAt: string): string {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
  if (days <= 7) return 'Updated this week'
  if (days <= 30) return 'Updated this month'
  return 'Older'
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recently_viewed',  label: 'Recently viewed' },
  { key: 'recently_updated', label: 'Recently updated' },
  { key: 'alphabetical',     label: 'Alphabetical' },
  { key: 'most_mentioned',   label: 'Most mentioned' },
]


export function PeoplePage() {
  const navigate = useNavigate()
  const { people, loading, create, syncFromAttendees } = usePeople()
  const { names: knownAttendees, loading: attendeesLoading } = useAttendees()

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('alphabetical')
  const [tagFilter, setTagFilter] = useState('')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('people-view') as ViewMode) ?? 'grid'
  )
  const handleViewChange = (v: ViewMode) => { setView(v); localStorage.setItem('people-view', v) }
  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => (localStorage.getItem('people-groupby') as GroupBy) ?? 'none'
  )
  const handleGroupByChange = (v: GroupBy) => { setGroupBy(v); localStorage.setItem('people-groupby', v) }

  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({})
  const [personTags, setPersonTags] = useState<Record<string, string[]>>({})
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
        for (const t of n.tags ?? []) if (!tags[n.person_id].includes(t)) tags[n.person_id].push(t)
        text[n.person_id] = (text[n.person_id] ?? '') + ' ' + n.content
      }
      setPersonTags(tags)
      setNoteText(text)
    })
  }, [people.length])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const tags of Object.values(personTags)) for (const t of tags) set.add(t)
    return [...set].sort()
  }, [personTags])

  const filtered = useMemo(() => {
    let list = people
    if (tagFilter) {
      list = list.filter(p => (personTags[p.id] ?? []).includes(tagFilter))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.role?.toLowerCase().includes(q) ||
        p.organization?.toLowerCase().includes(q) ||
        p.where_met?.toLowerCase().includes(q) ||
        (noteText[p.id] ?? '').toLowerCase().includes(q) ||
        (personTags[p.id] ?? []).some(t => t.toLowerCase().includes(q))
      )
    }

    const sorted = [...list]
    if (sort === 'alphabetical') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'recently_updated') sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    else if (sort === 'recently_viewed') sorted.sort((a, b) => (b.last_viewed_at ?? '').localeCompare(a.last_viewed_at ?? ''))
    else if (sort === 'most_mentioned') sorted.sort((a, b) => (mentionCounts[b.id] ?? 0) - (mentionCounts[a.id] ?? 0))
    return sorted
  }, [people, search, tagFilter, sort, mentionCounts, noteText, personTags])

  // Unified groupedItems — tag (a person can appear in multiple groups), recency, or alphabet
  const groupedItems = useMemo((): [string, Person[]][] | null => {
    if (groupBy === 'none') return null
    const groups = new Map<string, Person[]>()

    if (groupBy === 'tag') {
      for (const p of filtered) {
        const tags = personTags[p.id] ?? []
        if (tags.length === 0) {
          if (!groups.has('__none__')) groups.set('__none__', [])
          groups.get('__none__')!.push(p)
        } else {
          for (const t of tags) {
            if (!groups.has(t)) groups.set(t, [])
            groups.get(t)!.push(p)
          }
        }
      }
      return Array.from(groups.entries()).sort(([a], [b]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        return a.localeCompare(b)
      })
    }

    if (groupBy === 'recency') {
      for (const p of filtered) {
        const key = recencyBucket(p.updated_at)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(p)
      }
      return Array.from(groups.entries()).sort(([a], [b]) => RECENCY_ORDER.indexOf(a) - RECENCY_ORDER.indexOf(b))
    }

    // alphabet
    for (const p of filtered) {
      const first = p.name.trim()[0]?.toUpperCase() ?? '#'
      const key = /[A-Z]/.test(first) ? first : '#'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
  }, [filtered, personTags, groupBy])

  const displayLabel = (label: string) => label === '__none__' ? 'No tags' : label

  // Every known attendee gets a Person automatically — keeps People and attendees in sync.
  // Runs once per mount only — the ref guard prevents re-firing/overlapping runs that
  // would otherwise race on stale `people` state and create duplicates.
  const syncedRef = useRef(false)
  useEffect(() => {
    if (syncedRef.current) return
    if (attendeesLoading || loading || knownAttendees.length === 0) return
    syncedRef.current = true
    syncFromAttendees(knownAttendees)
  }, [attendeesLoading, loading, knownAttendees]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const subtitle = loading
    ? 'Loading…'
    : search || tagFilter
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
      : `${people.length} ${people.length !== 1 ? 'people' : 'person'}`

  const activeFilterCount = [tagFilter, groupBy !== 'none' ? groupBy : '', sort !== 'alphabetical' ? sort : ''].filter(Boolean).length

  const GridCard = ({ p }: { p: Person }) => (
    <div
      onClick={() => navigate(`/people/${p.id}`)}
      className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <Avatar person={p} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
        {p.role && <p className="text-xs text-gray-500 mt-0.5">{p.role}</p>}
        {(personTags[p.id]?.length ?? 0) > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {personTags[p.id].slice(0, 4).map(t => <Badge key={t} variant="indigo">{t}</Badge>)}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  )

  const ListRow = ({ p }: { p: Person }) => (
    <div
      onClick={() => navigate(`/people/${p.id}`)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/60 transition-colors cursor-pointer group"
    >
      <Avatar person={p} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {p.role && <span className="text-xs text-gray-500">{p.role}</span>}
          {(personTags[p.id]?.length ?? 0) > 0 && (
            <div className="flex gap-1 flex-wrap">
              {personTags[p.id].slice(0, 3).map(t => <Badge key={t} variant="indigo">{t}</Badge>)}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 shrink-0 hidden sm:block">
        Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
      </p>
      <RiArrowRightSLine size={16} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">People</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={handleViewChange} options={['list', 'grid']} />
          <Button onClick={openCreate}>New Person</Button>
        </div>
      </div>

      {/* Mobile: search + filter trigger */}
      <div className="flex gap-2 sm:hidden">
        <Input placeholder="Search people and notes..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-0" />
        <FilterTrigger onClick={() => setFilterSheetOpen(true)} activeCount={activeFilterCount} />
      </div>

      {/* Desktop: full inline filter bar */}
      <div className="hidden sm:flex gap-3 flex-wrap">
        <Input
          placeholder="Search people and notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px]"
        />
        {allTags.length > 0 && (
          <Select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="w-40">
            <option value="">All tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
        <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as GroupBy)} className="w-44">
          <option value="none">No grouping</option>
          <option value="tag">Group by tag</option>
          <option value="recency">Group by recency</option>
          <option value="alphabet">Group by letter</option>
        </Select>
        <Select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="w-44">
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      </div>

      {/* Mobile filter sheet */}
      <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} activeCount={activeFilterCount}>
        {allTags.length > 0 && (
          <FilterRow label="Tag">
            <Select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="w-full">
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FilterRow>
        )}
        <FilterRow label="Group by">
          <Select value={groupBy} onChange={e => handleGroupByChange(e.target.value as GroupBy)} className="w-full">
            <option value="none">No grouping</option>
            <option value="tag">Group by tag</option>
            <option value="recency">Group by recency</option>
            <option value="alphabet">Group by letter</option>
          </Select>
        </FilterRow>
        <FilterRow label="Sort">
          <Select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="w-full">
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </FilterRow>
      </FilterSheet>

      {loading ? (
        view === 'grid' ? <SkGridCards count={6} /> : <SkListCard rows={4} />
      ) : people.length === 0 ? (
        <EmptyState
          title="No people yet"
          description="Add the people you interact with so you can remember who they are and what matters to them."
          action={{ label: 'New Person', onClick: openCreate }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or filter." />
      ) : groupedItems ? (
        <div className="space-y-6">
          {groupedItems.map(([label, items]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{displayLabel(label)}</p>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-300 shrink-0">{items.length}</span>
              </div>
              {view === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(p => <GridCard key={p.id} p={p} />)}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {items.map(p => <ListRow key={p.id} p={p} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => <GridCard key={p.id} p={p} />)}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(p => <ListRow key={p.id} p={p} />)}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Person">
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
            autoFocus
          />
          <Input
            label="Title (optional)"
            value={form.role ?? ''}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            placeholder="e.g. Senior Engineer, Product Manager"
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
