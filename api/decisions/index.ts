import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // ── GET /api/decisions ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { project_id, status, limit = '50' } = req.query as Record<string, string>
      if (!project_id) return res.status(400).json({ error: 'project_id required' })

      let q = supabase
        .from('decisions')
        .select('*')
        .eq('project_id', project_id)
        .neq('source_type', 'journal_entry')
        .order('date', { ascending: false })
        .limit(parseInt(limit))

      if (status) q = q.eq('status', status)
      else        q = q.neq('status', 'dismissed')

      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ decisions: data ?? [] })
    }

    // ── POST /api/decisions (manual create) ─────────────────────────────────
    if (req.method === 'POST') {
      const { project_id, user_id, content, date, people, notes } = req.body ?? {}
      if (!project_id || !user_id || !content || !date) {
        return res.status(400).json({ error: 'project_id, user_id, content, date required' })
      }
      const { data, error } = await supabase.from('decisions').insert({
        project_id, user_id, content, date,
        people:      Array.isArray(people) ? people : (people ? [people] : []),
        notes:       notes ?? null,
        source_type: 'manual',
        source_id:   null,
        confidence:  null,
        status:      'active',
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(201).json({ decision: data })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('decisions/index error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' })
  }
}
