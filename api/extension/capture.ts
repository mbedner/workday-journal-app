import type { VercelRequest, VercelResponse } from '@vercel/node'

// Direct Supabase REST API calls — avoids supabase-js ESM bundling issues in Vercel functions.
function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are not set')
  const base = `${url}/rest/v1`
  const h: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  return {
    async select(table: string, qs: string): Promise<any[]> {
      const res = await fetch(`${base}/${table}?${qs}`, { headers: h })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    async insert(table: string, body: object): Promise<any> {
      const res = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const rows = await res.json()
      return Array.isArray(rows) ? rows[0] : rows
    },
    async insertMany(table: string, rows: object[]): Promise<void> {
      if (!rows.length) return
      const res = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(await res.text())
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
  const rows = await client.select('api_tokens', `token=eq.${encodeURIComponent(token)}&select=id,user_id`)
  if (!rows.length) return null
  client.patchAsync('api_tokens', `id=eq.${rows[0].id}`, { last_used_at: new Date().toISOString() })
  return rows[0].user_id
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let userId: string | null
  try {
    userId = await validateToken(token)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
  if (!userId) return res.status(401).json({ error: 'Invalid or expired token' })

  const { type, data } = (req.body ?? {}) as { type?: string; data?: Record<string, any> }

  // ── Task ─────────────────────────────────────────────────────────────────
  if (type === 'task') {
    const {
      title, notes, status = 'todo', priority = 'medium',
      due_date, source_url, source_title,
      projects: projectNames = [], subtasks = [],
    } = data ?? {}

    if (!title?.trim()) return res.status(400).json({ error: '"title" is required' })

    const sourceBlurb = source_url ? `\n\nSource: [${source_title || source_url}](${source_url})` : ''
    const notesWithSource = ((notes?.trim() ?? '') + sourceBlurb).trim() || null

    let task: any
    try {
      const client = db()
      task = await client.insert('tasks', {
        user_id: userId, title: title.trim(), notes: notesWithSource,
        status, priority, due_date: due_date || null,
        source_url: source_url || null, source_title: source_title || null,
        source_type: 'extension',
      })

      if (projectNames.length) {
        const projs = await client.select('projects', `user_id=eq.${userId}&name=in.(${projectNames.map((n: string) => `"${n}"`).join(',')})&select=id`)
        await client.insertMany('task_projects', projs.map((p: any) => ({ user_id: userId, task_id: task.id, project_id: p.id })))
      }

      if (subtasks.length) {
        const subtaskRows = (subtasks as string[]).filter(s => s?.trim()).map((s, i) => ({
          user_id: userId, task_id: task.id, title: s.trim(),
          completed: false, position: i,
        }))
        await client.insertMany('subtasks', subtaskRows)
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }

    return res.status(200).json({ id: task.id, type: 'task' })
  }

  // ── Meeting Note ─────────────────────────────────────────────────────────
  if (type === 'meeting_note') {
    const {
      meeting_title, meeting_date, attendees = [],
      projects: projectNames = [], tags: tagNames = [],
      notes, source_url, source_title,
    } = data ?? {}

    if (!meeting_title?.trim()) return res.status(400).json({ error: '"meeting_title" is required' })

    const sourceBlurb = source_url ? `\n\n---\nSource: [${source_title || source_url}](${source_url})` : ''
    const rawWithSource = ((notes?.trim() ?? '') + sourceBlurb).trim() || null

    let transcript: any
    try {
      const client = db()
      transcript = await client.insert('transcripts', {
        user_id: userId, meeting_title: meeting_title.trim(),
        meeting_date: meeting_date || new Date().toISOString().slice(0, 10),
        attendees: Array.isArray(attendees) ? attendees.join(', ') : (attendees || null),
        raw_transcript: rawWithSource,
        source_url: source_url || null, source_title: source_title || null,
      })

      if (projectNames.length) {
        const projs = await client.select('projects', `user_id=eq.${userId}&name=in.(${projectNames.map((n: string) => `"${n}"`).join(',')})&select=id`)
        await client.insertMany('transcript_projects', projs.map((p: any) => ({ user_id: userId, transcript_id: transcript.id, project_id: p.id })))
      }

      if (tagNames.length) {
        const tags = await client.select('tags', `user_id=eq.${userId}&name=in.(${tagNames.map((n: string) => `"${n}"`).join(',')})&select=id`)
        await client.insertMany('transcript_tags', tags.map((t: any) => ({ user_id: userId, transcript_id: transcript.id, tag_id: t.id })))
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }

    return res.status(200).json({ id: transcript.id, type: 'meeting_note' })
  }

  return res.status(400).json({ error: '"type" must be "task" or "meeting_note"' })
}
