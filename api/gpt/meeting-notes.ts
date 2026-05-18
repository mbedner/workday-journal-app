/**
 * GET /api/gpt/meeting-notes
 *
 * Query params:
 *   startDate   YYYY-MM-DD (optional)
 *   endDate     YYYY-MM-DD (optional)
 *   attendee    name substring match against the attendees field (optional)
 *   project     project name substring match (optional)
 *   limit       default 50, max 200
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, clamp, db, err, setCors, strip } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q     = req.query as Record<string, string>
  const limit = clamp(q.limit, 200)

  const params: string[] = [
    `user_id=eq.${userId}`,
    `archived_at=is.null`,
    `order=meeting_date.desc`,
    `limit=${limit}`,
    `select=id,meeting_title,meeting_date,attendees,summary,decisions,action_items,follow_ups,created_at,updated_at,` +
      `transcript_projects(projects(name)),transcript_tags(tags(name))`,
  ]

  if (q.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.startDate))
      return res.status(400).json(err('INVALID_DATE', 'startDate must be YYYY-MM-DD'))
    params.push(`meeting_date=gte.${q.startDate}`)
  }
  if (q.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.endDate))
      return res.status(400).json(err('INVALID_DATE', 'endDate must be YYYY-MM-DD'))
    params.push(`meeting_date=lte.${q.endDate}`)
  }
  if (q.startDate && q.endDate && q.startDate > q.endDate) {
    return res.status(400).json(err('INVALID_DATE_RANGE', 'startDate must be before endDate'))
  }

  // Attendee filter uses PostgREST ilike
  if (q.attendee) {
    params.push(`attendees=ilike.*${encodeURIComponent(q.attendee)}*`)
  }

  try {
    const client = db()
    let rows = await client.select('transcripts', params.join('&'))

    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r =>
        (r.transcript_projects ?? []).some((j: any) =>
          j.projects?.name?.toLowerCase().includes(needle)
        )
      )
    }

    const meetings = rows.map(r => {
      // Parse attendees from comma-separated string → array
      const attendees = (r.attendees ?? '')
        .split(',')
        .map((a: string) => a.trim())
        .filter(Boolean)

      // Parse action items: stored as JSON string or plain text
      let actionItems: { owner: string; task: string; dueDate: string | null }[] = []
      try {
        const parsed = JSON.parse(r.action_items ?? '[]')
        if (Array.isArray(parsed)) {
          actionItems = parsed.map((item: any) =>
            typeof item === 'string'
              ? { owner: '', task: item, dueDate: null }
              : { owner: item.owner ?? '', task: item.task ?? item.title ?? '', dueDate: item.dueDate ?? item.due_date ?? null }
          )
        }
      } catch {
        // Plain text fallback
        if (r.action_items?.trim()) {
          actionItems = strip(r.action_items)
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
            .map(task => ({ owner: '', task, dueDate: null }))
        }
      }

      // Parse decisions
      let decisions: string[] = []
      try {
        const parsed = JSON.parse(r.decisions ?? '[]')
        if (Array.isArray(parsed)) {
          decisions = parsed.map((d: any) =>
            typeof d === 'string' ? d : (d.title ?? d.text ?? JSON.stringify(d))
          )
        }
      } catch {
        if (r.decisions?.trim()) {
          decisions = strip(r.decisions).split('\n').map((s: string) => s.trim()).filter(Boolean)
        }
      }

      return {
        id:          r.id,
        date:        r.meeting_date,
        title:       r.meeting_title,
        attendees,
        projects:    (r.transcript_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        tags:        (r.transcript_tags     ?? []).map((j: any) => j.tags?.name).filter(Boolean),
        summary:     strip(r.summary)      || null,
        decisions,
        actionItems,
        followUps:   strip(r.follow_ups)   || null,
        createdAt:   r.created_at,
        updatedAt:   r.updated_at,
      }
    })

    return res.status(200).json({ meetings })
  } catch (e: any) {
    console.error('gpt/meeting-notes error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
