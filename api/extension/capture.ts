import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Uses SUPABASE_URL + SUPABASE_SERVICE_KEY (service-role key) — set these in Vercel env vars.
// Do NOT use the VITE_ prefixed vars — those are browser-only.
function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function validateToken(token: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('api_tokens')
    .select('id, user_id')
    .eq('token', token)
    .single()
  if (!data) return null
  // Fire-and-forget: update last_used_at
  supabase.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return data.user_id
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

  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
  const { type, data } = (req.body ?? {}) as { type?: string; data?: Record<string, any> }

  // ── Task ─────────────────────────────────────────────────────────────────
  if (type === 'task') {
    const {
      title,
      notes,
      status = 'todo',
      priority = 'medium',
      due_date,
      source_url,
      source_title,
      projects: projectNames = [],
      subtasks = [],
    } = data ?? {}

    if (!title?.trim()) return res.status(400).json({ error: '"title" is required' })

    // Embed the source URL in the notes body so it's visible in the app
    const sourceBlurb = source_url
      ? `\n\nSource: [${source_title || source_url}](${source_url})`
      : ''
    const notesWithSource = ((notes?.trim() ?? '') + sourceBlurb).trim() || null

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: title.trim(),
        notes: notesWithSource,
        status,
        priority,
        due_date: due_date || null,
        source_url: source_url || null,
        source_title: source_title || null,
        source_type: 'extension',
      })
      .select('id')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Link projects by name
    if (projectNames.length) {
      const { data: projs } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userId)
        .in('name', projectNames)
      if (projs?.length) {
        await supabase.from('task_projects').insert(
          projs.map((p: any) => ({ user_id: userId, task_id: task!.id, project_id: p.id }))
        )
      }
    }

    // Add subtasks as child tasks
    if (subtasks.length) {
      const subtaskRows = subtasks
        .filter((s: string) => s?.trim())
        .map((s: string) => ({
          user_id: userId,
          title: s.trim(),
          status: 'todo',
          priority: 'medium',
          source_type: 'extension',
          source_id: task!.id,
        }))
      if (subtaskRows.length) {
        await supabase.from('tasks').insert(subtaskRows)
      }
    }

    return res.status(200).json({ id: task!.id, type: 'task' })
  }

  // ── Meeting Note ─────────────────────────────────────────────────────────
  if (type === 'meeting_note') {
    const {
      meeting_title,
      meeting_date,
      attendees = [],
      projects: projectNames = [],
      tags: tagNames = [],
      notes,
      source_url,
      source_title,
    } = data ?? {}

    if (!meeting_title?.trim()) return res.status(400).json({ error: '"meeting_title" is required' })

    // Embed the source URL in raw_transcript so it's visible in the app
    const sourceBlurb = source_url
      ? `\n\n---\nSource: [${source_title || source_url}](${source_url})`
      : ''
    const rawWithSource = ((notes?.trim() ?? '') + sourceBlurb).trim() || null

    const { data: transcript, error } = await supabase
      .from('transcripts')
      .insert({
        user_id: userId,
        meeting_title: meeting_title.trim(),
        meeting_date: meeting_date || new Date().toISOString().slice(0, 10),
        attendees: Array.isArray(attendees) ? attendees.join(', ') : (attendees || null),
        raw_transcript: rawWithSource,
        source_url: source_url || null,
        source_title: source_title || null,
      })
      .select('id')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Link projects
    if (projectNames.length) {
      const { data: projs } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userId)
        .in('name', projectNames)
      if (projs?.length) {
        await supabase.from('transcript_projects').insert(
          projs.map((p: any) => ({ user_id: userId, transcript_id: transcript!.id, project_id: p.id }))
        )
      }
    }

    // Link tags
    if (tagNames.length) {
      const { data: tags } = await supabase
        .from('tags')
        .select('id, name')
        .eq('user_id', userId)
        .in('name', tagNames)
      if (tags?.length) {
        await supabase.from('transcript_tags').insert(
          tags.map((t: any) => ({ user_id: userId, transcript_id: transcript!.id, tag_id: t.id }))
        )
      }
    }

    return res.status(200).json({ id: transcript!.id, type: 'meeting_note' })
  }

  return res.status(400).json({ error: '"type" must be "task" or "meeting_note"' })
}
