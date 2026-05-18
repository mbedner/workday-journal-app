/**
 * GET /api/gpt/journal-entries
 *
 * Query params:
 *   startDate  YYYY-MM-DD (optional)
 *   endDate    YYYY-MM-DD (optional)
 *   project    project name substring match (optional)
 *   tag        tag name exact match (optional)
 *   limit      default 50, max 200
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, clamp, db, err, setCors, strip } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q   = req.query as Record<string, string>
  const limit = clamp(q.limit, 200)

  // Build PostgREST query string
  const params: string[] = [
    `user_id=eq.${userId}`,
    `archived_at=is.null`,
    `order=entry_date.desc`,
    `limit=${limit}`,
    `select=id,entry_date,focus,accomplished,needs_attention,reflection,productivity_rating,created_at,updated_at,` +
      `journal_entry_projects(projects(name)),journal_entry_tags(tags(name))`,
  ]

  if (q.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.startDate))
      return res.status(400).json(err('INVALID_DATE', 'startDate must be YYYY-MM-DD'))
    params.push(`entry_date=gte.${q.startDate}`)
  }
  if (q.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.endDate))
      return res.status(400).json(err('INVALID_DATE', 'endDate must be YYYY-MM-DD'))
    params.push(`entry_date=lte.${q.endDate}`)
  }
  if (q.startDate && q.endDate && q.startDate > q.endDate) {
    return res.status(400).json(err('INVALID_DATE_RANGE', 'startDate must be before endDate'))
  }

  try {
    const client = db()
    let rows = await client.select('journal_entries', params.join('&'))

    // Client-side project / tag filter (join-table embeds already loaded)
    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r =>
        (r.journal_entry_projects ?? []).some((j: any) =>
          j.projects?.name?.toLowerCase().includes(needle)
        )
      )
    }
    if (q.tag) {
      const needle = q.tag.toLowerCase()
      rows = rows.filter(r =>
        (r.journal_entry_tags ?? []).some((j: any) =>
          j.tags?.name?.toLowerCase() === needle
        )
      )
    }

    const entries = rows.map(r => ({
      id:                 r.id,
      date:               r.entry_date,
      focus:              strip(r.focus)              || null,
      accomplished:       strip(r.accomplished)       || null,
      needsAttention:     strip(r.needs_attention)    || null,
      reflection:         strip(r.reflection)         || null,
      productivityRating: r.productivity_rating       ?? null,
      projects:           (r.journal_entry_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
      tags:               (r.journal_entry_tags      ?? []).map((j: any) => j.tags?.name).filter(Boolean),
      createdAt:          r.created_at,
      updatedAt:          r.updated_at,
    }))

    return res.status(200).json({ entries })
  } catch (e: any) {
    console.error('gpt/journal-entries error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
