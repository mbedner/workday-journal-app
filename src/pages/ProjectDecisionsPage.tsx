import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiAddLine,
  RiMoreLine,
  RiScalesLine,
  RiCheckLine,
  RiCloseLine,
} from '@remixicon/react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { Decision, Project, Transcript } from '../types'
import { Button } from '../components/ui/Button'
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

const EMPTY_DESCRIPTIONS: Record<Tab, string> = {
  active:         'Decisions are extracted automatically from meeting notes, or you can add one manually.',
  pending_review: 'No decisions are waiting for review.',
  superseded:     'Decisions that have been replaced by newer ones will appear here.',
  dismissed:      'Dismissed decisions are kept for reference but hidden from the active view.',
}

function groupByMonth(decisions: Decision[]): Array<{ label: string; items: Decision[] }> {
  const groups = new Map<string, Decision[]>()
  for (const d of decisions) {
    const key = format(new Date(d.date + 'T12:00:00'), 'MMMM yyyy')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(d)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

// ── Decision card ─────────────────────────────────────────────────────────────

function DecisionCard({
  d, transcripts, tab, onInlineAction, onMenu,
}: {
  d:              Decision
  transcripts:    Transcript[]
  tab:            Tab
  onInlineAction: (action: 'activate' | 'dismiss', d: Decision) => void
  onMenu:         (d: Decision, e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const src = (() => {
    if (d.source_type !== 'meeting_note') return null
    const t = transcripts.find(x => x.id === d.source_id)
    return {
      label: t?.meeting_title ?? 'Meeting note',
      url:   `/transcripts/${d.source_id}`,
    }
  })()

  const isPending    = tab === 'pending_review'
  const isSuperseded = d.status === 'superseded'

  return (
    <div className={`px-4 py-4 flex items-start gap-3 ${isPending ? 'border-l-[3px] border-amber-400' : ''}`}>
      <div className={`flex-1 min-w-0 space-y-2 ${isSuperseded ? 'opacity-40' : ''}`}>

        {/* Decision statement */}
        <p className={`text-sm font-medium leading-snug ${isSuperseded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {d.content}
        </p>

        {/* Evidence blockquote */}
        {d.excerpt ? (
          <div className="flex gap-2.5">
            <div className="w-0.5 rounded-full bg-gray-200 shrink-0 self-stretch" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 italic leading-relaxed line-clamp-3">
                "{d.excerpt}"
              </p>
              {src && (
                <Link
                  to={src.url}
                  className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline mt-0.5 inline-block font-medium"
                >
                  {src.label}
                </Link>
              )}
            </div>
          </div>
        ) : src ? (
          /* No excerpt but has a source — show source inline */
          <p className="text-xs text-gray-400">
            From{' '}
            <Link to={src.url} className="text-indigo-500 hover:underline font-medium">
              {src.label}
            </Link>
          </p>
        ) : null}

        {/* Meta row: date + people */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-gray-400">
            {format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}
          </span>
          {d.people.map(p => (
            <span
              key={p}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600"
            >
              {p}
            </span>
          ))}
          {d.notes && (
            <span className="text-xs text-gray-400 italic">{d.notes}</span>
          )}
        </div>

        {/* Pending: inline confirm / dismiss */}
        {isPending && (
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => onInlineAction('activate', d)}
              className="inline-flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-2.5 py-1 rounded-md transition-colors"
            >
              <RiCheckLine size={11} /> Confirm
            </button>
            <button
              onClick={() => onInlineAction('dismiss', d)}
              className="inline-flex items-center gap-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-500 font-medium px-2.5 py-1 rounded-md transition-colors"
            >
              <RiCloseLine size={11} /> Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Overflow menu */}
      <button
        onClick={e => onMenu(d, e)}
        className="shrink-0 p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition mt-0.5"
      >
        <RiMoreLine size={15} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectDecisionsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [project,     setProject]     = useState<Project | null>(null)
  const [decisions,   setDecisions]   = useState<Decision[]>([])
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading,     setLoading]     = useState(true)
  const [userId,      setUserId]      = useState('')
  const [tab,         setTab]         = useState<Tab>('active')

  const [addOpen,      setAddOpen]      = useState(false)
  const [menuDecision, setMenuDecision] = useState<Decision | null>(null)
  const [menuAnchor,   setMenuAnchor]   = useState<{ top: number; left: number } | null>(null)

  // Add form
  const [content,   setContent]   = useState('')
  const [date,      setDate]      = useState(format(new Date(), 'yyyy-MM-dd'))
  const [people,    setPeople]    = useState('')
  const [notes,     setNotes]     = useState('')
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })

    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('transcript_projects').select('transcript_id').eq('project_id', id),
    ]).then(async ([{ data: proj }, { data: xp }]) => {
      if (!proj) { navigate('/projects'); return }
      setProject(proj)

      const transcriptIds = (xp ?? []).map((r: any) => r.transcript_id)
      if (transcriptIds.length) {
        const { data } = await supabase
          .from('transcripts').select('id, meeting_title').in('id', transcriptIds)
        setTranscripts((data ?? []) as Transcript[])
      }

      const all = await fetchDecisions(id, undefined, 500)
      setDecisions(all)
      setLoading(false)
    })
  }, [id, navigate])

  const reload = () => {
    if (!id) return
    fetchDecisions(id, undefined, 500).then(setDecisions).catch(() => {})
  }

  const handleInlineAction = async (action: 'activate' | 'dismiss', d: Decision) => {
    try {
      await updateDecision(d.id, { status: action === 'activate' ? 'active' : 'dismissed' })
      reload()
    } catch {
      addToast('Action failed', 'error')
    }
  }

  const handleMenuAction = async (action: string) => {
    if (!menuDecision) return
    setMenuAnchor(null)
    try {
      if (action === 'edit') {
        const text = window.prompt('Edit decision:', menuDecision.content)
        if (text?.trim()) {
          const updated = await updateDecision(menuDecision.id, { content: text.trim() })
          setDecisions(prev => prev.map(d => d.id === updated.id ? updated : d))
        }
      } else if (action === 'activate') {
        await updateDecision(menuDecision.id, { status: 'active' })
        reload()
      } else if (action === 'supersede') {
        await updateDecision(menuDecision.id, { status: 'superseded' })
        reload()
      } else if (action === 'dismiss') {
        await updateDecision(menuDecision.id, { status: 'dismissed' })
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

  const menuItems = (d: Decision) => {
    const items = [{ key: 'edit', label: 'Edit' }]
    if (d.status === 'active')               items.push({ key: 'supersede', label: 'Mark as superseded' })
    if (d.status !== 'dismissed')            items.push({ key: 'dismiss',   label: 'Dismiss' })
    if (d.status === 'dismissed' || d.status === 'superseded') items.push({ key: 'activate', label: 'Restore to active' })
    if (d.source_type === 'manual' || d.status === 'dismissed') items.push({ key: 'delete', label: 'Delete' })
    return items
  }

  const filtered = decisions.filter(d => d.status === tab)
  const grouped  = groupByMonth(filtered)

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-8 w-64 bg-gray-200 rounded" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  )

  return (
    <div
      className="space-y-6"
      onClick={() => { if (menuAnchor) { setMenuAnchor(null); setMenuDecision(null) } }}
    >
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
              <p className="text-sm text-gray-500">
                {decisions.filter(d => d.status === 'active').length} active decisions
              </p>
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
                  tab === t.key
                    ? 'bg-indigo-100 text-indigo-700'
                    : t.key === 'pending_review'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Decision list — grouped by month */}
      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${TABS.find(t => t.key === tab)?.label.toLowerCase() ?? ''} decisions`}
          description={EMPTY_DESCRIPTIONS[tab]}
          action={tab === 'active' ? { label: 'Add decision', onClick: () => setAddOpen(true) } : undefined}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, items }) => (
            <div key={label}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">
                  {label}
                </p>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300 shrink-0">{items.length}</span>
              </div>

              {/* Cards */}
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {items.map(d => (
                  <DecisionCard
                    key={d.id}
                    d={d}
                    transcripts={transcripts}
                    tab={tab}
                    onInlineAction={handleInlineAction}
                    onMenu={(decision, e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenuDecision(decision)
                      setMenuAnchor({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX - 148 })
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
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
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                item.key === 'delete' ? 'text-red-600' : 'text-gray-700'
              }`}
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
            placeholder="e.g. The MVP will not replace the existing search experience"
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
            <Button onClick={saveDecision} loading={addSaving} disabled={!content.trim()}>
              Add decision
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
