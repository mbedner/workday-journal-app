import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiAddLine,
  RiMoreLine,
  RiScalesLine,
} from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Decision, Project, JournalEntry, Transcript } from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../contexts/ToastContext'
import { fetchDecisions, createDecision, updateDecision, deleteDecision } from '../lib/decisions'

type Tab = 'active' | 'pending_review' | 'superseded' | 'dismissed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'active',         label: 'Active'     },
  { key: 'pending_review', label: 'Pending'    },
  { key: 'superseded',     label: 'Superseded' },
  { key: 'dismissed',      label: 'Dismissed'  },
]

export function ProjectDecisionsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [project,     setProject]     = useState<Project | null>(null)
  const [decisions,   setDecisions]   = useState<Decision[]>([])
  const [journals,    setJournals]    = useState<JournalEntry[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading,     setLoading]     = useState(true)
  const [userId,      setUserId]      = useState('')
  const [tab,         setTab]         = useState<Tab>('active')

  const [addOpen,      setAddOpen]      = useState(false)
  const [menuDecision, setMenuDecision] = useState<Decision | null>(null)
  const [menuAnchor,   setMenuAnchor]   = useState<{ top: number; left: number } | null>(null)

  // Add form
  const [content,  setContent]  = useState('')
  const [date,     setDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [people,   setPeople]   = useState('')
  const [notes,    setNotes]    = useState('')
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })

    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('journal_entry_projects').select('journal_entry_id').eq('project_id', id),
      supabase.from('transcript_projects').select('transcript_id').eq('project_id', id),
    ]).then(async ([{ data: proj }, { data: jp }, { data: xp }]) => {
      if (!proj) { navigate('/projects'); return }
      setProject(proj)

      const journalIds    = (jp ?? []).map((r: any) => r.journal_entry_id)
      const transcriptIds = (xp ?? []).map((r: any) => r.transcript_id)

      const [journalRes, transcriptRes] = await Promise.all([
        journalIds.length
          ? supabase.from('journal_entries').select('id, entry_date').in('id', journalIds)
          : Promise.resolve({ data: [] }),
        transcriptIds.length
          ? supabase.from('transcripts').select('id, meeting_title').in('id', transcriptIds)
          : Promise.resolve({ data: [] }),
      ])

      setJournals((journalRes.data ?? []) as JournalEntry[])
      setTranscripts((transcriptRes.data ?? []) as Transcript[])

      const all = await fetchDecisions(id, undefined, 500)
      // include all statuses
      setDecisions(all)
      setLoading(false)
    })
  }, [id, navigate])

  const reload = () => {
    if (!id) return
    fetchDecisions(id, undefined, 500).then(setDecisions).catch(() => {})
  }

  const sourceLabel = (d: Decision): { label: string; url: string } | null => {
    if (d.source_type === 'manual') return null
    if (d.source_type === 'journal_entry') {
      const entry = journals.find(j => j.id === d.source_id)
      const dateStr = entry?.entry_date ?? d.date
      return { label: `Journal · ${format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy')}`, url: `/journal/${dateStr}` }
    }
    const t = transcripts.find(x => x.id === d.source_id)
    return { label: t?.meeting_title ?? 'Meeting note', url: `/transcripts/${d.source_id}` }
  }

  const handleMenuAction = async (action: string) => {
    if (!menuDecision) return
    setMenuAnchor(null)
    try {
      if (action === 'edit') {
        const text = window.prompt('Edit decision:', menuDecision.content)
        if (text && text.trim()) {
          const updated = await updateDecision(menuDecision.id, { content: text.trim() })
          setDecisions(prev => prev.map(d => d.id === updated.id ? updated : d))
        }
      } else if (action === 'supersede') {
        await updateDecision(menuDecision.id, { status: 'superseded' })
        reload()
      } else if (action === 'dismiss') {
        await updateDecision(menuDecision.id, { status: 'dismissed' })
        reload()
      } else if (action === 'activate') {
        await updateDecision(menuDecision.id, { status: 'active' })
        reload()
      } else if (action === 'delete') {
        if (!window.confirm('Delete this decision permanently?')) return
        await deleteDecision(menuDecision.id)
        setDecisions(prev => prev.filter(d => d.id !== menuDecision.id))
        addToast('Decision deleted', 'success')
      }
    } catch (e: any) {
      addToast(e.message ?? 'Action failed', 'error')
    }
    setMenuDecision(null)
  }

  const saveDecision = async () => {
    if (!content.trim() || !userId || !id) return
    setAddSaving(true)
    try {
      const d = await createDecision({
        project_id: id,
        user_id:    userId,
        content:    content.trim(),
        date,
        people:     people.split(',').map(s => s.trim()).filter(Boolean),
        notes:      notes || undefined,
      })
      setDecisions(prev => [d, ...prev])
      setAddOpen(false)
      setContent(''); setDate(format(new Date(), 'yyyy-MM-dd')); setPeople(''); setNotes('')
      addToast('Decision added', 'success')
    } catch (e: any) {
      addToast(e.message ?? 'Failed to add decision', 'error')
    } finally {
      setAddSaving(false)
    }
  }

  const filtered = decisions.filter(d => d.status === tab)

  const statusBadge = (d: Decision) => {
    if (d.status === 'active')         return <Badge variant="green">Active</Badge>
    if (d.status === 'pending_review') return <Badge variant="yellow">Pending review</Badge>
    if (d.status === 'superseded')     return <Badge variant="gray">Superseded</Badge>
    if (d.status === 'dismissed')      return <Badge variant="gray">Dismissed</Badge>
    return null
  }

  const menuItems = (d: Decision) => {
    const items = [{ key: 'edit', label: 'Edit' }]
    if (d.status === 'active')               items.push({ key: 'supersede', label: 'Mark as superseded' })
    if (d.status !== 'dismissed')            items.push({ key: 'dismiss', label: 'Dismiss' })
    if (d.status === 'dismissed')            items.push({ key: 'activate', label: 'Restore to active' })
    if (d.source_type === 'manual' || d.status === 'dismissed') items.push({ key: 'delete', label: 'Delete' })
    return items
  }

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-8 w-64 bg-gray-200 rounded" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6" onClick={() => { if (menuAnchor) { setMenuAnchor(null); setMenuDecision(null) } }}>
      {/* Header */}
      <div>
        <Link
          to={`/projects/${id}`}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition mb-2"
        >
          <RiArrowLeftLine size={13} /> {project?.name}
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500">
              <RiScalesLine size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{project?.name} — Decisions</h1>
              <p className="text-sm text-gray-500">{decisions.filter(d => d.status === 'active').length} active decisions</p>
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <RiAddLine size={14} /> Add decision
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const count = decisions.filter(d => d.status === t.key).length
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Decision list */}
      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${(TABS.find(t => t.key === tab)?.label ?? '').toLowerCase()} decisions`}
          description={tab === 'active' ? 'Decisions are extracted automatically from journal entries and meeting notes, or you can add one manually.' : 'Nothing here yet.'}
          action={tab === 'active' ? { label: 'Add decision', onClick: () => setAddOpen(true) } : undefined}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {filtered.map(d => {
            const src = sourceLabel(d)
            const isSuperseded = d.status === 'superseded'
            return (
              <div key={d.id} className={`px-4 py-4 flex items-start gap-3 ${isSuperseded ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className={`text-sm text-gray-800 leading-snug ${isSuperseded ? 'line-through text-gray-400' : ''}`}>
                    {d.content}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-gray-400">{format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                    {src && (
                      <Link to={src.url} className="text-xs text-indigo-500 hover:underline">
                        From: {src.label}
                      </Link>
                    )}
                    {statusBadge(d)}
                    {d.people.map(p => (
                      <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">{p}</span>
                    ))}
                  </div>
                  {d.notes && <p className="text-xs text-gray-400 italic">{d.notes}</p>}
                </div>
                <button
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setMenuDecision(d)
                    setMenuAnchor({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX - 140 })
                  }}
                  className="shrink-0 p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <RiMoreLine size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Context menu */}
      {menuAnchor && menuDecision && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          onClick={e => e.stopPropagation()}
        >
          {menuItems(menuDecision).map(item => (
            <button
              key={item.key}
              onClick={() => handleMenuAction(item.key)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${item.key === 'delete' ? 'text-red-600' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Add decision modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add decision">
        <div className="space-y-4">
          <Textarea
            label="Decision"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder='e.g. The MVP will not replace the existing search experience'
            rows={3}
            autoFocus
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
          />
          <Input
            label="People (optional)"
            value={people}
            onChange={e => setPeople(e.target.value)}
            placeholder="Alice Smith, Bob Jones"
          />
          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Context about why this was decided"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveDecision} loading={addSaving} disabled={!content.trim()}>Add decision</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
