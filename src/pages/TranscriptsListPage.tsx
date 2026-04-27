import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RiArrowRightSLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { Transcript } from '../types'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { EmptyState } from '../components/ui/EmptyState'
import { SkListCard } from '../components/ui/Skeleton'

function stripMarkup(text: string): string {
  if (!text) return ''
  // Strip HTML tags
  let plain = text.replace(/<[^>]+>/g, ' ')
  // Strip markdown headings, bold, italic, code, etc.
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

  useEffect(() => {
    setLoading(true)
    supabase
      .from('transcripts')
      .select('*')
      .order('created_at', { ascending: sort === 'oldest' })
      .then(({ data }) => {
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

  const handleNew = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('transcripts')
      .insert({ user_id: user!.id, meeting_title: 'New Meeting' })
      .select()
      .single()
    if (data) navigate(`/transcripts/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-sm text-gray-500">{transcripts.length} meeting{transcripts.length !== 1 ? 's' : ''} logged</p>
        </div>
        <Button onClick={handleNew}>+ New meeting note</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search meeting notes..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={sort} onChange={e => setSort(e.target.value)} className="w-40">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {loading ? (
        <SkListCard rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No meeting notes yet"
          description="Paste meeting notes here so decisions, action items, and follow-ups are easier to find later."
          action={!search ? { label: '+ New meeting note', onClick: handleNew } : undefined}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map(t => (
            <Link
              key={t.id}
              to={`/transcripts/${t.id}`}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60 transition-colors group"
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
    </div>
  )
}
