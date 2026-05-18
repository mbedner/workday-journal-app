/**
 * GET /api/gpt/search
 *
 * Query params:
 *   q          search query (required)
 *   types      comma-separated: entries,tasks,meetings (default: all)
 *   startDate  YYYY-MM-DD (optional)
 *   endDate    YYYY-MM-DD (optional)
 *   limit      default 20, max 100
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, clamp, db, err, setCors, strip } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q = req.query as Record<string, string>

  if (!q.q?.trim()) {
    return res.status(400).json(err('MISSING_PARAMS', '"q" search query is required'))
  }

  const needle    = q.q.trim()
  const limit     = clamp(q.limit, 100)
  const typesRaw  = q.types?.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const types     = typesRaw?.length
    ? typesRaw
    : ['entries', 'tasks', 'meetings']

  const invalidTypes = types.filter(t => !['entries', 'tasks', 'meetings'].includes(t))
  if (invalidTypes.length) {
    return res.status(400).json(err('INVALID_TYPES', `Invalid types: ${invalidTypes.join(', ')}. Use: entries, tasks, meetings`))
  }

  if (q.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(q.startDate))
    return res.status(400).json(err('INVALID_DATE', 'startDate must be YYYY-MM-DD'))
  if (q.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(q.endDate))
    return res.status(400).json(err('INVALID_DATE', 'endDate must be YYYY-MM-DD'))
  if (q.startDate && q.endDate && q.startDate > q.endDate)
    return res.status(400).json(err('INVALID_DATE_RANGE', 'startDate must be before endDate'))

  const enc = (s: string) => encodeURIComponent(s)

  try {
    const client = db()
    const fetches: Promise<any[]>[] = []

    // Journal entries
    if (types.includes('entries')) {
      const params: string[] = [
        `user_id=eq.${userId}`,
        `archived_at=is.null`,
        `or=(focus.ilike.*${enc(needle)}*,accomplished.ilike.*${enc(needle)}*,needs_attention.ilike.*${enc(needle)}*,reflection.ilike.*${enc(needle)}*)`,
        `order=entry_date.desc`,
        `limit=${limit}`,
        `select=id,entry_date,focus,accomplished,needs_attention,reflection,` +
          `journal_entry_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`entry_date=gte.${q.startDate}`)
      if (q.endDate)   params.push(`entry_date=lte.${q.endDate}`)
      fetches.push(
        client.select('journal_entries', params.join('&')).then(rows =>
          rows.map(r => ({
            type:     'entry' as const,
            id:       r.id,
            date:     r.entry_date,
            title:    `Journal – ${r.entry_date}`,
            snippet:  buildSnippet(needle, [r.focus, r.accomplished, r.needs_attention, r.reflection]),
            projects: (r.journal_entry_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
          }))
        ),
      )
    }

    // Tasks
    if (types.includes('tasks')) {
      const params: string[] = [
        `user_id=eq.${userId}`,
        `archived_at=is.null`,
        `or=(title.ilike.*${enc(needle)}*,notes.ilike.*${enc(needle)}*)`,
        `order=created_at.desc`,
        `limit=${limit}`,
        `select=id,title,notes,status,created_at,` +
          `task_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`created_at=gte.${q.startDate}`)
      if (q.endDate)   params.push(`created_at=lte.${q.endDate}T23:59:59Z`)
      fetches.push(
        client.select('tasks', params.join('&')).then(rows =>
          rows.map(r => ({
            type:     'task' as const,
            id:       r.id,
            date:     r.created_at?.slice(0, 10),
            title:    r.title,
            snippet:  buildSnippet(needle, [r.title, r.notes]),
            projects: (r.task_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
            status:   r.status,
          }))
        ),
      )
    }

    // Meeting notes
    if (types.includes('meetings')) {
      const params: string[] = [
        `user_id=eq.${userId}`,
        `archived_at=is.null`,
        `or=(meeting_title.ilike.*${enc(needle)}*,summary.ilike.*${enc(needle)}*,raw_transcript.ilike.*${enc(needle)}*,decisions.ilike.*${enc(needle)}*,action_items.ilike.*${enc(needle)}*)`,
        `order=meeting_date.desc`,
        `limit=${limit}`,
        `select=id,meeting_title,meeting_date,summary,decisions,attendees,` +
          `transcript_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`meeting_date=gte.${q.startDate}`)
      if (q.endDate)   params.push(`meeting_date=lte.${q.endDate}`)
      fetches.push(
        client.select('transcripts', params.join('&')).then(rows =>
          rows.map(r => ({
            type:      'meeting' as const,
            id:        r.id,
            date:      r.meeting_date,
            title:     r.meeting_title,
            snippet:   buildSnippet(needle, [r.meeting_title, r.summary, r.decisions]),
            projects:  (r.transcript_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
            attendees: (r.attendees ?? '').split(',').map((a: string) => a.trim()).filter(Boolean),
          }))
        ),
      )
    }

    const resultSets = await Promise.all(fetches)
    const allResults = resultSets.flat()

    // Sort by date descending and apply limit
    allResults.sort((a, b) => {
      const da = a.date ?? ''
      const db_ = b.date ?? ''
      return da < db_ ? 1 : da > db_ ? -1 : 0
    })

    return res.status(200).json({ results: allResults.slice(0, limit), total: allResults.length })
  } catch (e: any) {
    console.error('gpt/search error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}

/** Extract a short snippet from the first field containing the needle */
function buildSnippet(needle: string, fields: (string | null | undefined)[]): string {
  const lower = needle.toLowerCase()
  for (const raw of fields) {
    const text = strip(raw)
    if (!text) continue
    const idx = text.toLowerCase().indexOf(lower)
    if (idx === -1) continue
    const start = Math.max(0, idx - 60)
    const end   = Math.min(text.length, idx + needle.length + 120)
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }
  return strip(fields.find(Boolean))?.slice(0, 200) ?? ''
}
