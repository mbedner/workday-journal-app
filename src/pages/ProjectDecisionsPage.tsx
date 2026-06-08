import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiAddLine,
  RiMoreLine,
  RiScalesLine,
  RiCheckLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiArrowUpDownLine,
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

type Tab       = 'active' | 'pending_review' | 'superseded' | 'dismissed'
type SortCol   = 'content' | 'type' | 'date'
type SortDir   = 'asc' | 'desc'

const TABS: { key: Tab; label: string }[] = [
  { key: 'active',         label: 'Active'     },
  { key: 'pending_review', label: 'Pending'    },
  { key: 'superseded',     label: 'Superseded' },
  { key: 'dismissed',      label: 'Dismissed'  },
]

const EMPTY_DESCRIPTIONS: Record<Tab, string> = {
  active:         'Decisions are extracted automatically from meeting notes, or you can add one manually.',
  pending_review: 'No decisions are waiting for review.',
  superseded:     'Decisions replaced by newer choices appear here.',
  dismissed:      'Dismissed decisions are kept for reference.',
}

const TYPE_ORDER: Record<string, number>  = { strategic: 0, tactical: 1, operational: 2 }
function sortDecisions(decisions: Decision[], col: SortCol, dir: SortDir): Decision[] {
  return [...decisions].sort((a, b) => {
    let cmp = 0
    if (col === 'content') cmp = a.content.localeCompare(b.content)
    if (col === 'date')    cmp = a.date.localeCompare(b.date)
    if (col === 'type')    cmp = (TYPE_ORDER[a.type ?? ''] ?? 9) - (TYPE_ORDER[b.type ?? ''] ?? 9)
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Sortable column header ────────────────────────────────────────────────────

function ColHeader({
  label, col, sortCol, sortDir, onSort, className = '',
}: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir
  onSort: (c: SortCol) => void; className?: string
}) {
  const active = sortCol === col
  return (
    <th className={`px-3 py-2.5 text-left ${className}`}>
      <button
        onClick={() => onSort(col)}
        className="flex items-center gap-1 group"
      >
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`transition-colors ${active ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`}>
          {active
            ? sortDir === 'asc' ? <RiArrowUpSLine size={13} /> : <RiArrowDownSLine size={13} />
            : <RiArrowUpDownLine size={12} />}
        </span>
      </button>
    </th>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  strategic:   'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  tactical:    'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  operational: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

function TypeBadge({ type }: { type: Decision['type'] }) {
  if (!type) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function DecisionMobileCard({
  d, transcripts, tab, expanded, onToggle, onInlineAction, onMenu,
}: {
  d:              Decision
  transcripts:    Transcript[]
  tab:            Tab
  expanded:       boolean
  onToggle:       () => void
  onInlineAction: (action: 'activate' | 'dismiss', d: Decision) => void
  onMenu:         (d: Decision, e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const src = (() => {
    if (d.source_type === 'meeting_note') {
      const t = transcripts.find(x => x.id === d.source_id)
      return { label: t?.meeting_title ?? 'Meeting note', url: `/transcripts/${d.source_id}` }
    }
    if (d.source_type === 'journal_entry') {
      return { label: `Journal · ${format(new Date(d.date + 'T12:00:00'), 'MMM d')}`, url: `/journal/${d.date}` }
    }
    return null
  })()

  const isPending = tab === 'pending_review'
  const isMuted   = d.status === 'superseded' || d.status === 'dismissed'

  const abbrevPeople = d.people.map(p => {
    const parts = p.trim().split(' ')
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })

  return (
    <div
      className={`p-4 border-b border-gray-100 last:border-0 transition-colors ${
        isPending ? 'bg-amber-50/40' : ''
      } ${isMuted ? 'opacity-50' : ''}`}
    >
      {/* Top row: type + date + actions */}
      <div className="flex items-center gap-2 mb-2">
        <TypeBadge type={d.type} />
        <span className="text-xs text-gray-400 ml-auto">
          {format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}
        </span>
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          {isPending ? (
            <>
              <button
                onClick={() => onInlineAction('activate', d)}
                title="Confirm"
                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <RiCheckLine size={14} />
              </button>
              <button
                onClick={() => onInlineAction('dismiss', d)}
                title="Dismiss"
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <RiCloseLine size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={e => onMenu(d, e)}
              className="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RiMoreLine size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Decision text — tap to expand */}
      <button
        className="w-full text-left"
        onClick={onToggle}
      >
        <p className={`text-sm font-medium leading-snug ${
          d.status === 'superseded' ? 'line-through text-gray-400' : 'text-gray-900'
        } ${expanded ? '' : 'line-clamp-3'}`}>
          {d.content}
        </p>
      </button>

      {/* Expanded: excerpt + source + people */}
      {expanded && (
        <div className="mt-2.5 space-y-2">
          {d.excerpt ? (
            <div className="flex gap-2">
              <div className="w-0.5 rounded-full bg-gray-200 shrink-0 self-stretch" />
              <p className="text-xs text-gray-500 italic leading-relaxed">"{d.excerpt}"</p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No excerpt available.</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {src && (
              <Link
                to={src.url}
                className="text-xs text-indigo-500 hover:underline font-medium"
                onClick={e => e.stopPropagation()}
              >
                {src.label}
              </Link>
            )}
            {abbrevPeople.length > 0 && (
              <span className="text-xs text-gray-500">{abbrevPeople.join(', ')}</span>
            )}
          </div>

          {d.notes && (
            <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-1.5">{d.notes}</p>
          )}

          {isPending && (
            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={() => onInlineAction('activate', d)}
                className="inline-flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-2.5 py-1 rounded-md transition-colors"
              >
                <RiCheckLine size={11} /> Confirm decision
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
      )}

      {/* Source line (always visible when not expanded) */}
      {!expanded && src && (
        <div className="mt-1.5">
          <Link
            to={src.url}
            onClick={e => e.stopPropagation()}
            className="text-xs text-indigo-400 hover:text-indigo-600 hover:underline"
          >
            {src.label}
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Table row ─────────────────────────────────────────────────────────────────

function DecisionRow({
  d, transcripts, tab, expanded, onToggle, onInlineAction, onMenu,
}: {
  d:              Decision
  transcripts:    Transcript[]
  tab:            Tab
  expanded:       boolean
  onToggle:       () => void
  onInlineAction: (action: 'activate' | 'dismiss', d: Decision) => void
  onMenu:         (d: Decision, e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const src = (() => {
    if (d.source_type === 'meeting_note') {
      const t = transcripts.find(x => x.id === d.source_id)
      return { label: t?.meeting_title ?? 'Meeting note', url: `/transcripts/${d.source_id}` }
    }
    if (d.source_type === 'journal_entry') {
      return { label: `Journal · ${format(new Date(d.date + 'T12:00:00'), 'MMM d')}`, url: `/journal/${d.date}` }
    }
    return null
  })()

  const isPending    = tab === 'pending_review'
  const isSuperseded = d.status === 'superseded'
  const isMuted      = isSuperseded || d.status === 'dismissed'

  const abbrevPeople = d.people.map(p => {
    const parts = p.trim().split(' ')
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })

  return (
    <>
      <tr
        className={`group transition-colors cursor-pointer select-none ${
          isPending ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-gray-50/80'
        } ${isMuted ? 'opacity-50' : ''}`}
        onClick={onToggle}
      >
        {/* Decision text */}
        <td className="px-4 py-3 w-full max-w-0">
          <div className="flex items-start gap-2">
            <span className={`shrink-0 mt-0.5 text-gray-300 group-hover:text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <RiArrowDownSLine size={15} />
            </span>
            <p className={`text-sm font-medium leading-snug line-clamp-2 ${isSuperseded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {d.content}
            </p>
          </div>
        </td>

        {/* Type */}
        <td className="px-3 py-3 whitespace-nowrap">
          <TypeBadge type={d.type} />
        </td>

        {/* Date */}
        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
          {format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}
        </td>

        {/* Source */}
        <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell max-w-[160px]">
          {src ? (
            <Link
              to={src.url}
              onClick={e => e.stopPropagation()}
              className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline font-medium block truncate"
              title={src.label}
            >
              {src.label}
            </Link>
          ) : (
            <span className="text-xs text-gray-300">Manual</span>
          )}
        </td>

        {/* People */}
        <td className="px-3 py-3 whitespace-nowrap hidden lg:table-cell">
          {abbrevPeople.length > 0 ? (
            <span className="text-xs text-gray-500" title={d.people.join(', ')}>
              {abbrevPeople.slice(0, 2).join(', ')}
              {abbrevPeople.length > 2 && (
                <span className="text-gray-400"> +{abbrevPeople.length - 2}</span>
              )}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>

        {/* Actions — stop propagation so click doesn't toggle expand */}
        <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          {isPending ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onInlineAction('activate', d)}
                title="Confirm decision"
                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <RiCheckLine size={14} />
              </button>
              <button
                onClick={() => onInlineAction('dismiss', d)}
                title="Dismiss"
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <RiCloseLine size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={e => onMenu(d, e)}
              className="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RiMoreLine size={15} />
            </button>
          )}
        </td>
      </tr>

      {/* Expanded row — excerpt + mobile-hidden metadata */}
      {expanded && (
        <tr className={isPending ? 'bg-amber-50/20' : 'bg-gray-50/40'}>
          <td colSpan={6} className="px-4 pb-4 pt-1">
            <div className="ml-5 space-y-2.5">

              {/* Excerpt blockquote */}
              {d.excerpt ? (
                <div className="flex gap-2.5">
                  <div className="w-0.5 rounded-full bg-gray-200 shrink-0 self-stretch" />
                  <div>
                    <p className="text-xs text-gray-500 italic leading-relaxed">
                      "{d.excerpt}"
                    </p>
                    {src && (
                      <Link to={src.url} className="text-xs text-indigo-500 hover:underline font-medium mt-0.5 inline-block">
                        {src.label}
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No excerpt available for this decision.</p>
              )}

              {/* Mobile: show columns that are hidden on small screens */}
              <div className="flex flex-wrap items-center gap-2 sm:hidden">
                <TypeBadge type={d.type} />
                {abbrevPeople.length > 0 && (
                  <span className="text-xs text-gray-500">{abbrevPeople.join(', ')}</span>
                )}
                {src && (
                  <Link to={src.url} className="text-xs text-indigo-500 hover:underline">{src.label}</Link>
                )}
              </div>
              <div className="flex-wrap items-center gap-2 hidden sm:flex md:hidden">
                {src && (
                  <span className="text-xs text-gray-400">
                    Source: <Link to={src.url} className="text-indigo-500 hover:underline">{src.label}</Link>
                  </span>
                )}
                {abbrevPeople.length > 0 && (
                  <span className="text-xs text-gray-500">{abbrevPeople.join(', ')}</span>
                )}
              </div>

              {d.notes && (
                <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-1.5">{d.notes}</p>
              )}

              {/* Pending: full confirm/dismiss with label */}
              {isPending && (
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => onInlineAction('activate', d)}
                    className="inline-flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-2.5 py-1 rounded-md transition-colors"
                  >
                    <RiCheckLine size={11} /> Confirm decision
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
          </td>
        </tr>
      )}
    </>
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
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [sortCol,     setSortCol]     = useState<SortCol>('date')
  const [sortDir,     setSortDir]     = useState<SortDir>('desc')

  const [menuDecision, setMenuDecision] = useState<Decision | null>(null)
  const [menuAnchor,   setMenuAnchor]   = useState<{ top: number; left: number } | null>(null)
  const [editDecision, setEditDecision] = useState<Decision | null>(null)
  const [editText,     setEditText]     = useState('')

  const [addOpen,   setAddOpen]   = useState(false)
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

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
    setExpanded(null)
  }

  // Optimistic status update — update local state immediately, then persist
  const applyStatus = (decisionId: string, newStatus: Decision['status']) => {
    setDecisions(prev => prev.map(d => d.id === decisionId ? { ...d, status: newStatus } : d))
    setExpanded(null)
    updateDecision(decisionId, { status: newStatus }).catch(() => {
      addToast('Action failed — refreshing', 'error')
      reload()
    })
  }

  const handleInlineAction = (action: 'activate' | 'dismiss', d: Decision) => {
    applyStatus(d.id, action === 'activate' ? 'active' : 'dismissed')
  }

  const handleMenuAction = async (action: string) => {
    if (!menuDecision) return
    setMenuAnchor(null)
    const d = menuDecision
    setMenuDecision(null)

    if (action === 'edit') {
      setEditDecision(d)
      setEditText(d.content)
      return
    }
    if (action === 'activate')  { applyStatus(d.id, 'active');     return }
    if (action === 'supersede') { applyStatus(d.id, 'superseded'); return }
    if (action === 'dismiss')   { applyStatus(d.id, 'dismissed');  return }
    if (action === 'delete') {
      if (!window.confirm('Delete this decision permanently?')) return
      try {
        await deleteDecision(d.id)
        setDecisions(prev => prev.filter(x => x.id !== d.id))
        addToast('Decision deleted', 'success')
      } catch (e: any) {
        addToast(e.message ?? 'Delete failed', 'error')
      }
    }
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
    const items: { key: string; label: string }[] = [{ key: 'edit', label: 'Edit' }]
    if (d.status === 'active')    items.push({ key: 'supersede', label: 'Mark as superseded' })
    if (d.status !== 'dismissed') items.push({ key: 'dismiss',   label: 'Dismiss' })
    if (d.status === 'dismissed' || d.status === 'superseded')
      items.push({ key: 'activate', label: 'Restore to active' })
    if (d.source_type === 'manual' || d.status === 'dismissed')
      items.push({ key: 'delete', label: 'Delete' })
    return items
  }

  const filtered = sortDecisions(
    decisions.filter(d => d.status === tab),
    sortCol, sortDir,
  )

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-8 w-64 bg-gray-200 rounded" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-100 px-4 flex items-center gap-3">
            <div className="h-3 w-2/3 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
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
                {decisions.filter(d => d.status === 'active').length} active
                {decisions.filter(d => d.status === 'pending_review').length > 0 && (
                  <span className="text-amber-600 font-medium">
                    {' · '}{decisions.filter(d => d.status === 'pending_review').length} pending review
                  </span>
                )}
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
              onClick={() => { setTab(t.key); setExpanded(null) }}
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

      {/* Table / Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${TABS.find(t => t.key === tab)?.label.toLowerCase() ?? ''} decisions`}
          description={EMPTY_DESCRIPTIONS[tab]}
          action={tab === 'active' ? { label: 'Add decision', onClick: () => setAddOpen(true) } : undefined}
        />
      ) : (
        <>
          {/* Mobile card list — visible below md */}
          <div className="md:hidden bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {filtered.map(d => (
              <DecisionMobileCard
                key={d.id}
                d={d}
                transcripts={transcripts}
                tab={tab}
                expanded={expanded === d.id}
                onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                onInlineAction={handleInlineAction}
                onMenu={(decision, e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setMenuDecision(decision)
                  setMenuAnchor({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX - 148 })
                }}
              />
            ))}
            <div className="px-4 py-2 bg-gray-50">
              <p className="text-xs text-gray-400">
                {filtered.length} {filtered.length === 1 ? 'decision' : 'decisions'}
              </p>
            </div>
          </div>

          {/* Desktop table — visible at md+ */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => handleSort('content')} className="flex items-center gap-1 group">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Decision</span>
                        <span className={`transition-colors ${sortCol === 'content' ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`}>
                          {sortCol === 'content'
                            ? sortDir === 'asc' ? <RiArrowUpSLine size={13} /> : <RiArrowDownSLine size={13} />
                            : <RiArrowUpDownLine size={12} />}
                        </span>
                      </button>
                    </th>
                    <ColHeader label="Type"   col="type" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <ColHeader label="Date"   col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell whitespace-nowrap">
                      Source
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden xl:table-cell whitespace-nowrap">
                      People
                    </th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(d => (
                    <DecisionRow
                      key={d.id}
                      d={d}
                      transcripts={transcripts}
                      tab={tab}
                      expanded={expanded === d.id}
                      onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                      onInlineAction={handleInlineAction}
                      onMenu={(decision, e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setMenuDecision(decision)
                        setMenuAnchor({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX - 148 })
                      }}
                    />
                  ))}
                </tbody>
            </table>

            {/* Footer: row count */}
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">
                {filtered.length} {filtered.length === 1 ? 'decision' : 'decisions'}
                {sortCol !== 'date' || sortDir !== 'desc'
                  ? ` · sorted by ${sortCol} ${sortDir === 'asc' ? '↑' : '↓'}`
                  : ''}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Backdrop + context menu */}
      {menuAnchor && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setMenuAnchor(null); setMenuDecision(null) }}
        />
      )}
      {menuAnchor && menuDecision && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
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

      {/* Edit decision modal */}
      <Modal open={!!editDecision} onClose={() => setEditDecision(null)} title="Edit decision">
        <div className="space-y-4">
          <Textarea
            label="Decision"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditDecision(null)}>Cancel</Button>
            <Button
              disabled={!editText.trim() || editText.trim() === editDecision?.content}
              onClick={async () => {
                if (!editDecision || !editText.trim()) return
                const trimmed = editText.trim()
                const prev    = editDecision
                // Optimistic
                setDecisions(ds => ds.map(d => d.id === prev.id ? { ...d, content: trimmed } : d))
                setEditDecision(null)
                addToast('Decision updated', 'success')
                try {
                  await updateDecision(prev.id, { content: trimmed })
                } catch {
                  // Revert on failure
                  setDecisions(ds => ds.map(d => d.id === prev.id ? { ...d, content: prev.content } : d))
                  addToast('Failed to save — changes reverted', 'error')
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      </Modal>

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
