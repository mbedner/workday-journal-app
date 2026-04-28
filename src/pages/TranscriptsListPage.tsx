import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Transcript } from '../types'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard } from '../components/ui/Skeleton'

function stripMarkup(text: string): string {
  if (!text) return ''
  let plain = text.replace(/<[^>]+>/g, ' ')
  plain = plain
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return plain
}

export function TranscriptsListPage() {
  const navigate = useNavigate()
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')

  // New meeting modal
  const [modalOpen, setModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setLoading(true)
    let q = supabase.from('transcripts').select('*').is('archived_at', null)
    if (sort === 'date-desc') {
      q = q.order('meeting_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    } else if (sort === 'date-asc') {
      q = q.order('meeting_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    } else {
      q = q.order('created_at', { ascending: sort === 'oldest' })
    }
    q.then(({ data }) => {
      setTranscripts(data ?? [])
      setLoading(false)
    })
  }, [sort])

  const filtered = transcripts.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.meeting_title.toLowerCase().includes(q) ||
      t.attendees?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q) ||
      t.decisions?.toLowerCase().includes(q) ||
      t.action_items?.toLowerCase().includes(q) ||
      t.raw_transcript?.toLowerCase().includes(q)
    )
  })

  const openModal = () => {
    setNewTitle('')
    setModalOpen(true)
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('transcripts')
      .insert({ user_id: user!.id, meeting_title: newTitle.trim() })
      .select()
      .single()
    setCreating(false)
    setModalOpen(false)
    if (data) navigate(`/transcripts/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-sm text-gray-500">{transcripts.length} meeting{transcripts.length !== 1 ? 's' : ''} logged</p>
        </div>
        <Button onClick={openModal}>+ New meeting note</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search meeting notes..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-52">
          <option value="newest">Created: newest first</option>
          <option value="oldest">Created: oldest first</option>
          <option value="date-desc">Meeting date: newest</option>
          <option value="date-asc">Meeting date: oldest</option>
        </Select>
      </div>

      {loading ? (
        <SkListCard rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No meeting notes yet"
          description="Paste meeting notes here so decisions, action items, and follow-ups are easier to find later."
          action={!search ? { label: '+ New meeting note', onClick: openModal } : undefined}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(t => (
            <Link
              key={t.id}
              to={`/transcripts/${t.id}`}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-indigo-50/60 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{t.meeting_title}</p>
                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                  {t.meeting_date && <span>{t.meeting_date}</span>}
                  {t.attendees && <span className="truncate">{t.attendees}</span>}
                </div>
                {(t.raw_transcript ?? t.summary) && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {stripMarkup(t.raw_transcript ?? t.summary ?? '')}
                  </p>
                )}
              </div>
              <RiArrowRightSLine size={18} className="text-gray-300 group-hover:text-indigo-400 transition shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* New meeting modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New meeting note" size="sm">
        <div className="space-y-4">
          <Input
            label="Meeting title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="e.g. Q2 Planning, Design Review..."
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newTitle.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
