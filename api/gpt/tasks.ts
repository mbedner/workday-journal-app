/**
 * GET /api/gpt/tasks
 *
 * Query params:
 *   status     open | in_progress | completed | blocked (optional)
 *   startDate  YYYY-MM-DD — filters by created_at or completed_at (optional)
 *   endDate    YYYY-MM-DD (optional)
 *   project    project name substring match (optional)
 *   limit      default 100, max 250
 *
 * Status mapping (GPT → DB):
 *   open        → todo
 *   in_progress → in_progress
 *   completed   → done
 *   blocked     → blocked
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, clamp, db, err, setCors, strip } from './_db'

const STATUS_MAP: Record<string, string> = {
  open:        'todo',
  in_progress: 'in_progress',
  completed:   'done',
  blocked:     'blocked',
}
const STATUS_REVERSE: Record<string, string> = {
  todo:        'open',
  in_progress: 'in_progress',
  done:        'completed',
  blocked:     'blocked',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q     = req.query as Record<string, string>
  const limit = clamp(q.limit, 250)

  const params: string[] = [
    `user_id=eq.${userId}`,
    `archived_at=is.null`,
    `order=created_at.desc`,
    `limit=${limit}`,
    `select=id,title,notes,status,priority,due_date,completed_at,created_at,updated_at,` +
      `task_projects(projects(name)),task_tags(tags(name))`,
  ]

  // Status filter
  if (q.status) {
    const dbStatus = STATUS_MAP[q.status]
    if (!dbStatus) {
      return res.status(400).json(
        err('INVALID_STATUS', 'status must be: open, in_progress, completed, or blocked')
      )
    }
    params.push(`status=eq.${dbStatus}`)
  }

  // Date range — apply to created_at (open/in_progress) or completed_at (done)
  const isCompletedFilter = q.status === 'completed'
  const dateField = isCompletedFilter ? 'completed_at' : 'created_at'

  if (q.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.startDate))
      return res.status(400).json(err('INVALID_DATE', 'startDate must be YYYY-MM-DD'))
    params.push(`${dateField}=gte.${q.startDate}`)
  }
  if (q.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.endDate))
      return res.status(400).json(err('INVALID_DATE', 'endDate must be YYYY-MM-DD'))
    // For completed_at, extend to end of day
    const endTs = isCompletedFilter ? `${q.endDate}T23:59:59Z` : q.endDate
    params.push(`${dateField}=lte.${endTs}`)
  }
  if (q.startDate && q.endDate && q.startDate > q.endDate) {
    return res.status(400).json(err('INVALID_DATE_RANGE', 'startDate must be before endDate'))
  }

  try {
    const client = db()
    let rows = await client.select('tasks', params.join('&'))

    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r =>
        (r.task_projects ?? []).some((j: any) =>
          j.projects?.name?.toLowerCase().includes(needle)
        )
      )
    }

    const tasks = rows.map(r => ({
      id:          r.id,
      title:       r.title,
      description: strip(r.notes) || null,
      status:      STATUS_REVERSE[r.status] ?? r.status,
      priority:    r.priority,
      project:     (r.task_projects ?? [])[0]?.projects?.name ?? null,
      projects:    (r.task_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
      tags:        (r.task_tags    ?? []).map((j: any) => j.tags?.name).filter(Boolean),
      dueDate:     r.due_date    ?? null,
      completedAt: r.completed_at ?? null,
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    }))

    return res.status(200).json({ tasks })
  } catch (e: any) {
    console.error('gpt/tasks error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
