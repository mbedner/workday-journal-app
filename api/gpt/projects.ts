/**
 * GET /api/gpt/projects
 *
 * Query params:
 *   status   active | completed | all  (default: active)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, db, err, setCors } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q      = req.query as Record<string, string>
  const status = (q.status ?? 'active').toLowerCase()

  if (!['active', 'completed', 'all'].includes(status)) {
    return res.status(400).json(err('INVALID_STATUS', 'status must be: active, completed, or all'))
  }

  const params: string[] = [
    `user_id=eq.${userId}`,
    `archived_at=is.null`,
    `order=name.asc`,
    `select=id,name,description,completed_at,created_at,updated_at`,
  ]

  // active = no completed_at; completed = has completed_at; all = no filter
  if (status === 'active')    params.push('completed_at=is.null')
  if (status === 'completed') params.push('completed_at=not.is.null')

  try {
    const rows = await db().select('projects', params.join('&'))

    const projects = rows.map(r => ({
      id:          r.id,
      name:        r.name,
      status:      r.completed_at ? 'completed' : 'active',
      description: r.description ?? null,
      completedAt: r.completed_at ?? null,
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    }))

    return res.status(200).json({ projects })
  } catch (e: any) {
    console.error('gpt/projects error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
