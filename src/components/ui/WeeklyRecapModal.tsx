import { useState } from 'react'
import { format, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns'
import { RiSparklingLine, RiFileCopyLine, RiCheckLine, RiBookOpenLine } from '@remixicon/react'
import { supabase } from '../../lib/supabase'
import { Modal } from './Modal'
import { Button } from './Button'
import { generateWeeklyRecap, WeeklyRecap } from '../../lib/ai'
import { useToast } from '../../contexts/ToastContext'

interface Props {
  open: boolean
  onClose: () => void
}

interface Section { label: string; key: keyof WeeklyRecap }

const SECTIONS: Section[] = [
  { label: 'Summary',              key: 'summary'        },
  { label: 'Key Accomplishments',  key: 'accomplishments' },
  { label: 'Meetings & Decisions', key: 'decisions'       },
  { label: 'Open Items',           key: 'open_items'      },
  { label: 'Blockers',             key: 'blockers'        },
  { label: 'Next Week Priorities', key: 'next_steps'      },
]

function toPlain(recap: WeeklyRecap): string {
  return SECTIONS.map(({ label, key }) => {
    const val = recap[key]
    if (!val || (Array.isArray(val) && val.length === 0)) return null
    if (Array.isArray(val)) return `## ${label}\n${val.map(v => `• ${v}`).join('\n')}`
    return `## ${label}\n${val}`
  }).filter(Boolean).join('\n\n')
}

export function WeeklyRecapModal({ open, onClose }: Props) {
  const { addToast } = useToast()
  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const defaultEnd   = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [weekStart, setWeekStart] = useState(defaultStart)
  const [weekEnd, setWeekEnd]     = useState(defaultEnd)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<WeeklyRecap | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)

  const generate = async () => {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const [{ data: journals }, { data: tasks }, { data: transcripts }] = await Promise.all([
        supabase.from('journal_entries').select('*')
          .gte('entry_date', weekStart).lte('entry_date', weekEnd).is('archived_at', null),
        supabase.from('tasks').select('*').is('archived_at', null)
          .gte('updated_at', weekStart).lte('updated_at', weekEnd + 'T23:59:59'),
        supabase.from('transcripts').select('*').is('archived_at', null),
      ])

      // Filter transcripts to those within the week
      const start = parseISO(weekStart)
      const end   = parseISO(weekEnd)
      const weekTranscripts = (transcripts ?? []).filter((t: any) => {
        if (!t.meeting_date) return false
        try { return isWithinInterval(parseISO(t.meeting_date), { start, end }) } catch { return false }
      })

      const weekLabel = `${format(parseISO(weekStart), 'MMM d')} – ${format(parseISO(weekEnd), 'MMM d, yyyy')}`

      const recap = await generateWeeklyRecap({
        weekLabel,
        journals: (journals ?? []).map((j: any) => ({
          date: j.entry_date,
          focus: j.focus,
          accomplished: j.accomplished,
          needs_attention: j.needs_attention,
          reflection: j.reflection,
        })),
        completedTasks: (tasks ?? []).filter((t: any) => t.status === 'done').map((t: any) => ({ title: t.title, status: t.status })),
        openTasks: (tasks ?? []).filter((t: any) => t.status !== 'done').map((t: any) => ({ title: t.title, status: t.status })),
        transcripts: weekTranscripts.map((t: any) => ({
          title: t.meeting_title,
          date: t.meeting_date,
          content: t.raw_transcript ?? t.summary,
        })),
      })
      setResult(recap)
    } catch (e: any) {
      setError(e.message ?? 'AI assist unavailable. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyAll = async () => {
    if (!result) return
    await navigator.clipboard.writeText(toPlain(result)).catch(() => {})
    setCopied('all')
    setTimeout(() => setCopied(null), 2000)
  }

  const copySection = async (key: string, text: string) => {
    const plain = Array.isArray(text)
      ? (text as unknown as string[]).map(v => `• ${v}`).join('\n')
      : text
    await navigator.clipboard.writeText(plain).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveToJournal = async () => {
    if (!result) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const html = `<p><strong>Weekly recap (${format(parseISO(weekStart), 'MMM d')} – ${format(parseISO(weekEnd), 'MMM d, yyyy')})</strong></p>`
        + `<p>${result.summary}</p>`
        + (result.accomplishments.length ? `<h3>Accomplishments</h3><ul>${result.accomplishments.map(a => `<li>${a}</li>`).join('')}</ul>` : '')
        + (result.decisions.length ? `<h3>Meetings &amp; Decisions</h3><ul>${result.decisions.map(d => `<li>${d}</li>`).join('')}</ul>` : '')
        + (result.open_items.length ? `<h3>Open Items</h3><ul>${result.open_items.map(o => `<li>${o}</li>`).join('')}</ul>` : '')
        + (result.blockers.length ? `<h3>Blockers</h3><ul>${result.blockers.map(b => `<li>${b}</li>`).join('')}</ul>` : '')
        + (result.next_steps.length ? `<h3>Next Week</h3><ul>${result.next_steps.map(n => `<li>${n}</li>`).join('')}</ul>` : '')

      // Check if a journal entry exists for the end-of-week date (Friday), else use today
      const targetDate = weekEnd <= today ? weekEnd : today
      const { data: existing } = await supabase
        .from('journal_entries').select('id, reflection').eq('entry_date', targetDate).maybeSingle()

      if (existing) {
        const current = existing.reflection ?? ''
        await supabase.from('journal_entries')
          .update({ reflection: current ? current + '\n\n' + html : html, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('journal_entries').insert({
          user_id: user!.id,
          entry_date: targetDate,
          reflection: html,
          updated_at: new Date().toISOString(),
        })
      }
      addToast('Saved to journal', 'success')
      onClose()
    } catch {
      addToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <>
      <div>
        {result && (
          <Button variant="secondary" onClick={saveToJournal} loading={saving}>
            <RiBookOpenLine size={14} className="mr-1.5" /> Save to journal
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {result && (
          <Button variant="secondary" onClick={copyAll}>
            {copied === 'all'
              ? <><RiCheckLine size={14} className="mr-1" /> Copied!</>
              : <><RiFileCopyLine size={14} className="mr-1" /> Copy all</>
            }
          </Button>
        )}
      </div>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="Generate weekly recap" size="lg" footer={footer}>
      <div className="space-y-4">
        {/* Date range picker */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Week start</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => { setWeekStart(e.target.value); setResult(null) }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Week end</label>
            <input
              type="date"
              value={weekEnd}
              onChange={e => { setWeekEnd(e.target.value); setResult(null) }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button onClick={generate} loading={loading} disabled={!weekStart || !weekEnd}>
            <RiSparklingLine size={14} className="mr-1.5" /> Generate
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 animate-pulse">
            <RiSparklingLine size={16} className="text-indigo-400" />
            <span className="text-sm">Generating your weekly recap…</span>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100">
            {SECTIONS.map(({ label, key }) => {
              const val = result[key]
              const isArray = Array.isArray(val)
              const isEmpty = !val || (isArray && (val as string[]).length === 0)
              if (isEmpty) return null
              return (
                <div key={key} className="px-4 py-3 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                    <button
                      onClick={() => copySection(key, val as unknown as string)}
                      className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-indigo-600 flex items-center gap-1 text-xs"
                    >
                      {copied === key
                        ? <><RiCheckLine size={12} className="text-green-500" /> Copied</>
                        : <><RiFileCopyLine size={12} /> Copy</>
                      }
                    </button>
                  </div>
                  {isArray ? (
                    <ul className="space-y-1">
                      {(val as string[]).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-700">{val as string}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
