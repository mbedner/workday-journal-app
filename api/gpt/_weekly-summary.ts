/**
 * GET /api/gpt/weekly-summary
 *
 * Required query params:
 *   startDate  YYYY-MM-DD
 *   endDate    YYYY-MM-DD
 *
 * Returns a synthesized summary of work activity for the period including
 * project breakdown, themes (from tags), blockers, and notable wins.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, db, err, setCors, strip } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use GET'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const q = req.query as Record<string, string>

  if (!q.startDate || !q.endDate) {
    return res.status(400).json(err('MISSING_PARAMS', 'startDate and endDate are required'))
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(q.endDate)) {
    return res.status(400).json(err('INVALID_DATE', 'Dates must be YYYY-MM-DD'))
  }
  if (q.startDate > q.endDate) {
    return res.status(400).json(err('INVALID_DATE_RANGE', 'startDate must be before endDate'))
  }

  const { startDate, endDate } = q

  try {
    const client = db()

    // Fetch all three data types in parallel for the date range
    const [entries, tasks, meetings] = await Promise.all([
      client.select(
        'journal_entries',
        [
          `user_id=eq.${userId}`,
          `archived_at=is.null`,
          `entry_date=gte.${startDate}`,
          `entry_date=lte.${endDate}`,
          `order=entry_date.desc`,
          `select=id,entry_date,focus,accomplished,needs_attention,reflection,` +
            `journal_entry_projects(projects(name)),journal_entry_tags(tags(name))`,
        ].join('&'),
      ),
      client.select(
        'tasks',
        [
          `user_id=eq.${userId}`,
          `archived_at=is.null`,
          `or=(created_at.gte.${startDate},completed_at.gte.${startDate})`,
          `or=(created_at.lte.${endDate}T23:59:59Z,completed_at.lte.${endDate}T23:59:59Z)`,
          `order=created_at.desc`,
          `select=id,title,status,priority,completed_at,due_date,` +
            `task_projects(projects(name)),task_tags(tags(name))`,
        ].join('&'),
      ),
      client.select(
        'transcripts',
        [
          `user_id=eq.${userId}`,
          `archived_at=is.null`,
          `meeting_date=gte.${startDate}`,
          `meeting_date=lte.${endDate}`,
          `order=meeting_date.desc`,
          `select=id,meeting_title,meeting_date,attendees,decisions,action_items,` +
            `transcript_projects(projects(name)),transcript_tags(tags(name))`,
        ].join('&'),
      ),
    ])

    // ── Counts ────────────────────────────────────────────────────────────
    const completedTasks = tasks.filter(t => t.status === 'done')
    const openTasks      = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress')
    const blockedTasks   = tasks.filter(t => t.status === 'blocked')

    // ── Project activity ──────────────────────────────────────────────────
    const projectHits = new Map<string, { entries: number; tasks: number; meetings: number }>()

    const hitProject = (name: string, field: 'entries' | 'tasks' | 'meetings') => {
      const curr = projectHits.get(name) ?? { entries: 0, tasks: 0, meetings: 0 }
      curr[field]++
      projectHits.set(name, curr)
    }

    for (const e of entries)  for (const j of e.journal_entry_projects ?? []) if (j.projects?.name) hitProject(j.projects.name, 'entries')
    for (const t of tasks)    for (const j of t.task_projects           ?? []) if (j.projects?.name) hitProject(j.projects.name, 'tasks')
    for (const m of meetings) for (const j of m.transcript_projects     ?? []) if (j.projects?.name) hitProject(j.projects.name, 'meetings')

    const projectSummaries = [...projectHits.entries()]
      .sort((a, b) => {
        const totalA = a[1].entries + a[1].tasks + a[1].meetings
        const totalB = b[1].entries + b[1].tasks + b[1].meetings
        return totalB - totalA
      })
      .map(([name, counts]) => {
        const total = counts.entries + counts.tasks + counts.meetings
        const activityLevel = total >= 8 ? 'high' : total >= 3 ? 'medium' : 'low'
        return { name, activityLevel, touchpoints: counts }
      })

    // ── Themes (from tags) ────────────────────────────────────────────────
    const tagCount = new Map<string, number>()
    const countTag = (name: string) => tagCount.set(name, (tagCount.get(name) ?? 0) + 1)

    for (const e of entries)  for (const j of e.journal_entry_tags ?? []) if (j.tags?.name) countTag(j.tags.name)
    for (const t of tasks)    for (const j of t.task_tags          ?? []) if (j.tags?.name) countTag(j.tags.name)
    for (const m of meetings) for (const j of m.transcript_tags    ?? []) if (j.tags?.name) countTag(j.tags.name)

    const themes = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name)

    // ── Blockers ──────────────────────────────────────────────────────────
    const blockers: string[] = []
    for (const t of blockedTasks) blockers.push(`Task blocked: ${t.title}`)
    for (const e of entries) {
      const na = strip(e.needs_attention)
      if (na) blockers.push(na.slice(0, 200))
    }

    // ── Notable wins ──────────────────────────────────────────────────────
    const notableWins: string[] = []
    for (const t of completedTasks.slice(0, 10)) notableWins.push(`Completed: ${t.title}`)
    for (const e of entries) {
      const acc = strip(e.accomplished)
      if (acc) notableWins.push(acc.slice(0, 200))
    }

    // ── Auto-generated narrative summary ─────────────────────────────────
    const projectNames = projectSummaries.slice(0, 3).map(p => p.name)
    const summary = [
      `Between ${startDate} and ${endDate}:`,
      `${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''} completed,`,
      `${openTasks.length} open,`,
      `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}.`,
      projectNames.length ? `Active projects: ${projectNames.join(', ')}.` : '',
      themes.length ? `Key themes: ${themes.slice(0, 5).join(', ')}.` : '',
    ].filter(Boolean).join(' ')

    return res.status(200).json({
      startDate,
      endDate,
      summary,
      completedTasksCount: completedTasks.length,
      openTasksCount:      openTasks.length,
      blockedTasksCount:   blockedTasks.length,
      meetingsCount:       meetings.length,
      journalEntriesCount: entries.length,
      projects:            projectSummaries,
      themes,
      blockers:            blockers.slice(0, 10),
      notableWins:         notableWins.slice(0, 10),
    })
  } catch (e: any) {
    console.error('gpt/weekly-summary error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
