/**
 * GPT Connector — single self-contained serverless function.
 * Routes /api/gpt/<endpoint> to the appropriate handler.
 *
 * All helpers and handler logic are inlined here to avoid Vercel's bundler
 * failing to resolve _ prefixed sibling imports at runtime.
 *
 * Endpoints:
 *   GET  /api/gpt/health
 *   GET  /api/gpt/journal-entries
 *   GET  /api/gpt/tasks
 *   GET  /api/gpt/meeting-notes
 *   GET  /api/gpt/weekly-summary
 *   GET  /api/gpt/projects
 *   GET  /api/gpt/search
 *   POST /api/gpt/reflections
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Shared helpers ──────────────────────────────────────────────────────────

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set')
  const base = `${url}/rest/v1`
  const h: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  return {
    async select(table: string, qs: string): Promise<any[]> {
      const r = await fetch(`${base}/${table}?${qs}`, { headers: h })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    async insert(table: string, body: object): Promise<any> {
      const r = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] : rows
    },
    async patch(table: string, qs: string, body: object): Promise<any> {
      const r = await fetch(`${base}/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] : rows
    },
    patchAsync(table: string, qs: string, body: object) {
      fetch(`${base}/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }).catch(() => {})
    },
  }
}

async function validateToken(token: string): Promise<string | null> {
  const client = db()
  const rows = await client.select(
    'api_tokens',
    `token=eq.${encodeURIComponent(token)}&select=id,user_id`,
  )
  if (!rows.length) return null
  client.patchAsync('api_tokens', `id=eq.${rows[0].id}`, {
    last_used_at: new Date().toISOString(),
  })
  return rows[0].user_id
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

async function authenticate(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const authHeader = (req.headers.authorization ?? '') as string
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) { res.status(401).json(e('UNAUTHORIZED', 'Missing Authorization header')); return null }
  try {
    const userId = await validateToken(token)
    if (!userId) { res.status(401).json(e('UNAUTHORIZED', 'Invalid or expired token')); return null }
    return userId
  } catch (err: any) {
    res.status(500).json(e('SERVER_ERROR', err.message)); return null
  }
}

function e(code: string, message: string) { return { error: { code, message } } }
function strip(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
}
function clamp(value: unknown, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return max
  return Math.min(Math.max(1, Math.floor(n)), max)
}
function dateOk(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d) }

/**
 * Build a properly-escaped PostgREST "contains" ilike filter fragment, e.g.
 * `ilike.%22*term*%22`. encodeURIComponent alone only protects the value
 * during URL transit — PostgREST decodes it back to literal characters
 * before parsing `or=(...)` filter syntax, so a needle containing a comma
 * or parenthesis could otherwise break out of its intended clause.
 * Wrapping the value in double quotes (PostgREST's own escaping convention)
 * makes those characters literal again once decoded server-side.
 */
function ilikeContains(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `ilike.${encodeURIComponent(`"*${escaped}*"`)}`
}

// ─── Router ──────────────────────────────────────────────────────────────────

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Parse the route segment directly from the URL — more reliable than
  // req.query.path which can be unpopulated depending on Vercel's catch-all handling.
  // URL shape: /api/gpt/<segment>[?queryParams]
  const pathname = (req.url ?? '/').split('?')[0]          // '/api/gpt/health'
  const parts    = pathname.split('/').filter(Boolean)      // ['api', 'gpt', 'health']
  const segment  = parts[2] ?? ''                           // 'health'

  const routes: Record<string, Handler> = {
    'health':          handleHealth,
    'journal-entries': handleJournalEntries,
    'tasks':           handleTasks,
    'meeting-notes':   handleMeetingNotes,
    'weekly-summary':  handleWeeklySummary,
    'projects':        handleProjects,
    'search':          handleSearch,
    'reflections':     handleReflections,
  }

  const route = routes[segment]
  if (!route) {
    res.status(404).json(e('NOT_FOUND', `Unknown route: /api/gpt/${segment}`))
    return
  }
  await route(req, res)
}

// ─── GET /api/gpt/health ─────────────────────────────────────────────────────

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok', app: 'workday-journal', version: '1.0.0' })
}

// ─── GET /api/gpt/journal-entries ────────────────────────────────────────────

async function handleJournalEntries(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q     = req.query as Record<string, string>
  const limit = clamp(q.limit, 200)

  if (q.startDate && !dateOk(q.startDate)) { res.status(400).json(e('INVALID_DATE', 'startDate must be YYYY-MM-DD')); return }
  if (q.endDate   && !dateOk(q.endDate))   { res.status(400).json(e('INVALID_DATE', 'endDate must be YYYY-MM-DD'));   return }
  if (q.startDate && q.endDate && q.startDate > q.endDate) { res.status(400).json(e('INVALID_DATE_RANGE', 'startDate must be before endDate')); return }

  const params: string[] = [
    `user_id=eq.${userId}`, `archived_at=is.null`, `order=entry_date.desc`, `limit=${limit}`,
    `select=id,entry_date,focus,accomplished,needs_attention,reflection,productivity_rating,created_at,updated_at,` +
      `journal_entry_projects(projects(name)),journal_entry_tags(tags(name))`,
  ]
  if (q.startDate) params.push(`entry_date=gte.${q.startDate}`)
  if (q.endDate)   params.push(`entry_date=lte.${q.endDate}`)

  try {
    const client = db()
    let rows = await client.select('journal_entries', params.join('&'))
    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r => (r.journal_entry_projects ?? []).some((j: any) => j.projects?.name?.toLowerCase().includes(needle)))
    }
    if (q.tag) {
      const needle = q.tag.toLowerCase()
      rows = rows.filter(r => (r.journal_entry_tags ?? []).some((j: any) => j.tags?.name?.toLowerCase() === needle))
    }
    res.status(200).json({
      entries: rows.map(r => ({
        id: r.id, date: r.entry_date,
        focus:              strip(r.focus)           || null,
        accomplished:       strip(r.accomplished)    || null,
        needsAttention:     strip(r.needs_attention) || null,
        reflection:         strip(r.reflection)      || null,
        productivityRating: r.productivity_rating    ?? null,
        projects: (r.journal_entry_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        tags:     (r.journal_entry_tags     ?? []).map((j: any) => j.tags?.name).filter(Boolean),
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    })
  } catch (err: any) {
    console.error('gpt/journal-entries', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── GET /api/gpt/tasks ──────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string>    = { open: 'todo', in_progress: 'in_progress', completed: 'done', blocked: 'blocked' }
const STATUS_REVERSE: Record<string, string> = { todo: 'open', in_progress: 'in_progress', done: 'completed', blocked: 'blocked' }

async function handleTasks(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q     = req.query as Record<string, string>
  const limit = clamp(q.limit, 250)

  if (q.status && !STATUS_MAP[q.status]) { res.status(400).json(e('INVALID_STATUS', 'status must be: open, in_progress, completed, or blocked')); return }
  if (q.startDate && !dateOk(q.startDate)) { res.status(400).json(e('INVALID_DATE', 'startDate must be YYYY-MM-DD')); return }
  if (q.endDate   && !dateOk(q.endDate))   { res.status(400).json(e('INVALID_DATE', 'endDate must be YYYY-MM-DD'));   return }
  if (q.startDate && q.endDate && q.startDate > q.endDate) { res.status(400).json(e('INVALID_DATE_RANGE', 'startDate must be before endDate')); return }

  const isCompleted = q.status === 'completed'
  const dateField   = isCompleted ? 'completed_at' : 'created_at'

  const params: string[] = [
    `user_id=eq.${userId}`, `archived_at=is.null`, `order=created_at.desc`, `limit=${limit}`,
    `select=id,title,notes,status,priority,due_date,completed_at,created_at,updated_at,` +
      `task_projects(projects(name)),task_tags(tags(name))`,
  ]
  if (q.status)    params.push(`status=eq.${STATUS_MAP[q.status]}`)
  if (q.startDate) params.push(`${dateField}=gte.${q.startDate}`)
  if (q.endDate)   params.push(`${dateField}=lte.${isCompleted ? q.endDate + 'T23:59:59Z' : q.endDate}`)

  try {
    const client = db()
    let rows = await client.select('tasks', params.join('&'))
    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r => (r.task_projects ?? []).some((j: any) => j.projects?.name?.toLowerCase().includes(needle)))
    }
    res.status(200).json({
      tasks: rows.map(r => ({
        id: r.id, title: r.title,
        description: strip(r.notes) || null,
        status:   STATUS_REVERSE[r.status] ?? r.status,
        priority: r.priority,
        project:  (r.task_projects ?? [])[0]?.projects?.name ?? null,
        projects: (r.task_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        tags:     (r.task_tags    ?? []).map((j: any) => j.tags?.name).filter(Boolean),
        dueDate:     r.due_date     ?? null,
        completedAt: r.completed_at ?? null,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    })
  } catch (err: any) {
    console.error('gpt/tasks', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── GET /api/gpt/meeting-notes ──────────────────────────────────────────────

async function handleMeetingNotes(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q     = req.query as Record<string, string>
  const limit = clamp(q.limit, 200)

  if (q.startDate && !dateOk(q.startDate)) { res.status(400).json(e('INVALID_DATE', 'startDate must be YYYY-MM-DD')); return }
  if (q.endDate   && !dateOk(q.endDate))   { res.status(400).json(e('INVALID_DATE', 'endDate must be YYYY-MM-DD'));   return }
  if (q.startDate && q.endDate && q.startDate > q.endDate) { res.status(400).json(e('INVALID_DATE_RANGE', 'startDate must be before endDate')); return }

  const params: string[] = [
    `user_id=eq.${userId}`, `archived_at=is.null`, `order=meeting_date.desc`, `limit=${limit}`,
    `select=id,meeting_title,meeting_date,attendees,summary,decisions,action_items,follow_ups,created_at,updated_at,` +
      `transcript_projects(projects(name)),transcript_tags(tags(name))`,
  ]
  if (q.startDate) params.push(`meeting_date=gte.${q.startDate}`)
  if (q.endDate)   params.push(`meeting_date=lte.${q.endDate}`)
  if (q.attendee)  params.push(`attendees=${ilikeContains(q.attendee)}`)

  try {
    const client = db()
    let rows = await client.select('transcripts', params.join('&'))
    if (q.project) {
      const needle = q.project.toLowerCase()
      rows = rows.filter(r => (r.transcript_projects ?? []).some((j: any) => j.projects?.name?.toLowerCase().includes(needle)))
    }

    const meetings = rows.map(r => {
      const attendees = (r.attendees ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)

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
        actionItems = strip(r.action_items).split('\n').map(s => s.trim()).filter(Boolean).map(task => ({ owner: '', task, dueDate: null }))
      }

      let decisions: string[] = []
      try {
        const parsed = JSON.parse(r.decisions ?? '[]')
        if (Array.isArray(parsed)) decisions = parsed.map((d: any) => typeof d === 'string' ? d : (d.title ?? d.text ?? ''))
      } catch {
        decisions = strip(r.decisions).split('\n').map((s: string) => s.trim()).filter(Boolean)
      }

      return {
        id: r.id, date: r.meeting_date, title: r.meeting_title,
        attendees,
        projects: (r.transcript_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        tags:     (r.transcript_tags     ?? []).map((j: any) => j.tags?.name).filter(Boolean),
        summary:   strip(r.summary)    || null,
        decisions,
        actionItems,
        followUps: strip(r.follow_ups) || null,
        createdAt: r.created_at, updatedAt: r.updated_at,
      }
    })
    res.status(200).json({ meetings })
  } catch (err: any) {
    console.error('gpt/meeting-notes', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── GET /api/gpt/weekly-summary ─────────────────────────────────────────────

async function handleWeeklySummary(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q = req.query as Record<string, string>
  if (!q.startDate || !q.endDate)           { res.status(400).json(e('MISSING_PARAMS', 'startDate and endDate are required')); return }
  if (!dateOk(q.startDate))                 { res.status(400).json(e('INVALID_DATE', 'startDate must be YYYY-MM-DD')); return }
  if (!dateOk(q.endDate))                   { res.status(400).json(e('INVALID_DATE', 'endDate must be YYYY-MM-DD')); return }
  if (q.startDate > q.endDate)              { res.status(400).json(e('INVALID_DATE_RANGE', 'startDate must be before endDate')); return }

  const { startDate, endDate } = q

  try {
    const client = db()
    const [entries, tasks, meetings] = await Promise.all([
      client.select('journal_entries', [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `entry_date=gte.${startDate}`, `entry_date=lte.${endDate}`,
        `order=entry_date.desc`,
        `select=id,entry_date,accomplished,needs_attention,journal_entry_projects(projects(name)),journal_entry_tags(tags(name))`,
      ].join('&')),
      client.select('tasks', [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `created_at=gte.${startDate}`, `created_at=lte.${endDate}T23:59:59Z`,
        `order=created_at.desc`,
        `select=id,title,status,priority,completed_at,due_date,task_projects(projects(name)),task_tags(tags(name))`,
      ].join('&')),
      client.select('transcripts', [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `meeting_date=gte.${startDate}`, `meeting_date=lte.${endDate}`,
        `order=meeting_date.desc`,
        `select=id,meeting_title,meeting_date,transcript_projects(projects(name)),transcript_tags(tags(name))`,
      ].join('&')),
    ])

    const completedTasks = tasks.filter(t => t.status === 'done')
    const openTasks      = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress')
    const blockedTasks   = tasks.filter(t => t.status === 'blocked')

    const projectHits = new Map<string, { entries: number; tasks: number; meetings: number }>()
    const hitProject  = (name: string, field: 'entries' | 'tasks' | 'meetings') => {
      const curr = projectHits.get(name) ?? { entries: 0, tasks: 0, meetings: 0 }
      curr[field]++
      projectHits.set(name, curr)
    }
    for (const r of entries)  for (const j of r.journal_entry_projects ?? []) if (j.projects?.name) hitProject(j.projects.name, 'entries')
    for (const r of tasks)    for (const j of r.task_projects           ?? []) if (j.projects?.name) hitProject(j.projects.name, 'tasks')
    for (const r of meetings) for (const j of r.transcript_projects     ?? []) if (j.projects?.name) hitProject(j.projects.name, 'meetings')

    const projectSummaries = [...projectHits.entries()]
      .sort((a, b) => (b[1].entries + b[1].tasks + b[1].meetings) - (a[1].entries + a[1].tasks + a[1].meetings))
      .map(([name, counts]) => {
        const total = counts.entries + counts.tasks + counts.meetings
        return { name, activityLevel: total >= 8 ? 'high' : total >= 3 ? 'medium' : 'low', touchpoints: counts }
      })

    const tagCount = new Map<string, number>()
    for (const r of entries)  for (const j of r.journal_entry_tags ?? []) if (j.tags?.name) tagCount.set(j.tags.name, (tagCount.get(j.tags.name) ?? 0) + 1)
    for (const r of tasks)    for (const j of r.task_tags          ?? []) if (j.tags?.name) tagCount.set(j.tags.name, (tagCount.get(j.tags.name) ?? 0) + 1)
    for (const r of meetings) for (const j of r.transcript_tags    ?? []) if (j.tags?.name) tagCount.set(j.tags.name, (tagCount.get(j.tags.name) ?? 0) + 1)
    const themes = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name)

    const blockers: string[] = [
      ...blockedTasks.map(t => `Task blocked: ${t.title}`),
      ...entries.map(r => strip(r.needs_attention)).filter(Boolean).map(s => s.slice(0, 200)),
    ]
    const notableWins: string[] = [
      ...completedTasks.slice(0, 10).map(t => `Completed: ${t.title}`),
      ...entries.map(r => strip(r.accomplished)).filter(Boolean).map(s => s.slice(0, 200)),
    ]

    const topProjects = projectSummaries.slice(0, 3).map(p => p.name)
    const summary = [
      `Between ${startDate} and ${endDate}:`,
      `${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''} completed,`,
      `${openTasks.length} open,`,
      `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}.`,
      topProjects.length ? `Active projects: ${topProjects.join(', ')}.` : '',
      themes.length ? `Key themes: ${themes.slice(0, 5).join(', ')}.` : '',
    ].filter(Boolean).join(' ')

    res.status(200).json({
      startDate, endDate, summary,
      completedTasksCount: completedTasks.length,
      openTasksCount:      openTasks.length,
      blockedTasksCount:   blockedTasks.length,
      meetingsCount:       meetings.length,
      journalEntriesCount: entries.length,
      projects:    projectSummaries,
      themes,
      blockers:    blockers.slice(0, 10),
      notableWins: notableWins.slice(0, 10),
    })
  } catch (err: any) {
    console.error('gpt/weekly-summary', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── GET /api/gpt/projects ────────────────────────────────────────────────────

async function handleProjects(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q      = req.query as Record<string, string>
  const status = (q.status ?? 'active').toLowerCase()
  if (!['active', 'completed', 'all'].includes(status)) {
    res.status(400).json(e('INVALID_STATUS', 'status must be: active, completed, or all')); return
  }

  const params: string[] = [
    `user_id=eq.${userId}`, `archived_at=is.null`, `order=name.asc`,
    `select=id,name,description,completed_at,created_at,updated_at`,
  ]
  if (status === 'active')    params.push('completed_at=is.null')
  if (status === 'completed') params.push('completed_at=not.is.null')

  try {
    const rows = await db().select('projects', params.join('&'))
    res.status(200).json({
      projects: rows.map(r => ({
        id: r.id, name: r.name,
        status:      r.completed_at ? 'completed' : 'active',
        description: r.description  ?? null,
        completedAt: r.completed_at ?? null,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    })
  } catch (err: any) {
    console.error('gpt/projects', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── GET /api/gpt/search ─────────────────────────────────────────────────────

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

async function handleSearch(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use GET')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const q = req.query as Record<string, string>
  if (!q.q?.trim()) { res.status(400).json(e('MISSING_PARAMS', '"q" search query is required')); return }

  const needle   = q.q.trim()
  const limit    = clamp(q.limit, 100)
  const typesRaw = q.types?.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const types    = typesRaw?.length ? typesRaw : ['entries', 'tasks', 'meetings']
  const invalid  = types.filter(t => !['entries', 'tasks', 'meetings'].includes(t))
  if (invalid.length) { res.status(400).json(e('INVALID_TYPES', `Invalid types: ${invalid.join(', ')}`)); return }
  if (q.startDate && !dateOk(q.startDate)) { res.status(400).json(e('INVALID_DATE', 'startDate must be YYYY-MM-DD')); return }
  if (q.endDate   && !dateOk(q.endDate))   { res.status(400).json(e('INVALID_DATE', 'endDate must be YYYY-MM-DD'));   return }

  try {
    const client  = db()
    const fetches: Promise<any[]>[] = []
    const term = ilikeContains(needle)

    if (types.includes('entries')) {
      const params = [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `or=(focus.${term},accomplished.${term},needs_attention.${term},reflection.${term})`,
        `order=entry_date.desc`, `limit=${limit}`,
        `select=id,entry_date,focus,accomplished,needs_attention,reflection,journal_entry_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`entry_date=gte.${q.startDate}`)
      if (q.endDate)   params.push(`entry_date=lte.${q.endDate}`)
      fetches.push(client.select('journal_entries', params.join('&')).then(rows => rows.map(r => ({
        type: 'entry', id: r.id, date: r.entry_date,
        title:    `Journal – ${r.entry_date}`,
        snippet:  buildSnippet(needle, [r.focus, r.accomplished, r.needs_attention, r.reflection]),
        projects: (r.journal_entry_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
      }))))
    }

    if (types.includes('tasks')) {
      const params = [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `or=(title.${term},notes.${term})`,
        `order=created_at.desc`, `limit=${limit}`,
        `select=id,title,notes,status,created_at,task_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`created_at=gte.${q.startDate}`)
      if (q.endDate)   params.push(`created_at=lte.${q.endDate}T23:59:59Z`)
      fetches.push(client.select('tasks', params.join('&')).then(rows => rows.map(r => ({
        type: 'task', id: r.id, date: r.created_at?.slice(0, 10),
        title:    r.title,
        snippet:  buildSnippet(needle, [r.title, r.notes]),
        projects: (r.task_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        status:   r.status,
      }))))
    }

    if (types.includes('meetings')) {
      const params = [
        `user_id=eq.${userId}`, `archived_at=is.null`,
        `or=(meeting_title.${term},summary.${term},raw_transcript.${term},decisions.${term},action_items.${term})`,
        `order=meeting_date.desc`, `limit=${limit}`,
        `select=id,meeting_title,meeting_date,summary,decisions,attendees,transcript_projects(projects(name))`,
      ]
      if (q.startDate) params.push(`meeting_date=gte.${q.startDate}`)
      if (q.endDate)   params.push(`meeting_date=lte.${q.endDate}`)
      fetches.push(client.select('transcripts', params.join('&')).then(rows => rows.map(r => ({
        type: 'meeting', id: r.id, date: r.meeting_date,
        title:     r.meeting_title,
        snippet:   buildSnippet(needle, [r.meeting_title, r.summary, r.decisions]),
        projects:  (r.transcript_projects ?? []).map((j: any) => j.projects?.name).filter(Boolean),
        attendees: (r.attendees ?? '').split(',').map((a: string) => a.trim()).filter(Boolean),
      }))))
    }

    const resultSets  = await Promise.all(fetches)
    const allResults  = resultSets.flat()
    allResults.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1))
    res.status(200).json({ results: allResults.slice(0, limit), total: allResults.length })
  } catch (err: any) {
    console.error('gpt/search', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}

// ─── POST /api/gpt/reflections ───────────────────────────────────────────────

async function handleReflections(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json(e('METHOD_NOT_ALLOWED', 'Use POST')); return }
  const userId = await authenticate(req, res)
  if (!userId) return

  const body = (req.body ?? {}) as { date?: string; title?: string; body?: string; source?: string }
  if (!body.date || !dateOk(body.date)) { res.status(400).json(e('INVALID_DATE', 'date is required and must be YYYY-MM-DD')); return }
  if (!body.body?.trim())               { res.status(400).json(e('MISSING_PARAMS', 'body is required')); return }

  const source        = body.source ? `\n\n*Source: ${body.source}*` : ''
  const reflectionText = body.body.trim() + source

  try {
    const client   = db()
    const existing = await client.select('journal_entries', `user_id=eq.${userId}&entry_date=eq.${body.date}&select=id,reflection`)

    let entryId: string
    if (existing.length) {
      const combined = [existing[0].reflection?.trim(), reflectionText].filter(Boolean).join('\n\n---\n\n')
      await client.patch('journal_entries', `id=eq.${existing[0].id}`, { reflection: combined, updated_at: new Date().toISOString() })
      entryId = existing[0].id
    } else {
      const inserted = await client.insert('journal_entries', {
        user_id: userId, entry_date: body.date,
        focus: body.title?.trim() || null,
        reflection: reflectionText,
      })
      entryId = inserted.id
    }
    res.status(201).json({ id: entryId, status: existing.length ? 'appended' : 'created', date: body.date })
  } catch (err: any) {
    console.error('gpt/reflections', err)
    res.status(500).json(e('SERVER_ERROR', err.message))
  }
}
