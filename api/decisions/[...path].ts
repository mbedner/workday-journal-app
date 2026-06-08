import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ── Supabase (service role — bypasses RLS for server-side ops) ────────────────
// Env var names match the rest of the codebase (SUPABASE_URL / SUPABASE_SERVICE_KEY),
// with VITE_ fallbacks for local dev where only those keys exist in .env.
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

const GEMINI_MODEL = 'gemini-2.5-flash'
const MAX_CHARS    = 14_000

// ── Route helpers ─────────────────────────────────────────────────────────────

function getSegments(req: VercelRequest): string[] {
  const pathname = (req.url ?? '/').split('?')[0]
  return pathname.split('/').filter(Boolean)
  // e.g. ['api', 'decisions', 'extract'] or ['api', 'decisions', 'abc-123']
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalise(a).split(' ').filter(Boolean))
  const setB = new Set(normalise(b).split(' ').filter(Boolean))
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

async function isDuplicate(projectId: string, content: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('decisions')
    .select('content')
    .eq('project_id', projectId)
    .gte('date', sevenDaysAgo)
    .not('status', 'eq', 'dismissed')
  for (const row of (data ?? [])) {
    if (jaccardSimilarity(content, row.content) > 0.8) return true
  }
  return false
}

// ── Gemini extraction ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are analyzing a work log entry to extract decisions.

A decision is something the author or their team committed to, agreed on, moved toward, or explicitly ruled out. Look for signals like: "we decided", "the team agreed", "going forward", "the plan is", "we ruled out", "we're deprioritizing", "the MVP will/won't", "we're moving toward."

Do NOT extract observations, aspirations, or things still under discussion. Only extract things that were resolved or committed to.

Return a JSON array. If no decisions are found, return []. Each item:
{
  "content": "concise present-tense statement of the decision",
  "confidence": "high" | "medium" | "low",
  "people": ["first and last names mentioned in context of this decision"],
  "excerpt": "the sentence or phrase from the source that led to this extraction"
}`

async function extractDecisionsFromContent(opts: {
  content:      string
  date:         string
  projectName:  string
  attendees:    string
}): Promise<Array<{ content: string; confidence: 'high' | 'medium' | 'low'; people: string[]; excerpt: string }>> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return []

  const stripped = opts.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, MAX_CHARS)
  const userPrompt = [
    `Entry date: ${opts.date}`,
    `Project: ${opts.projectName}`,
    `People involved: ${opts.attendees || 'none listed'}`,
    `Content:\n${stripped}`,
  ].join('\n')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents:          [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature:    0.1,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      console.error('decisions/extract: Gemini error', data?.error?.message ?? response.status)
      return []
    }

    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    console.log(`decisions/extract: Gemini raw (${raw.length} chars):`, raw.slice(0, 200))

    // Strip markdown code fences if present (```json ... ```)
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonText)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('decisions/extract: parse error', err)
    return []
  }
}

// ── Core extraction job (shared by /extract and /backfill) ────────────────────

async function runExtraction(opts: {
  sourceType: 'journal_entry' | 'meeting_note'
  sourceId:   string
  projectIds: string[]
  userId:     string
}): Promise<{ extracted: number; skipped: number }> {
  let extracted = 0
  let skipped   = 0

  // Fetch source record
  let content   = ''
  let date      = new Date().toISOString().slice(0, 10)
  let attendees = ''

  if (opts.sourceType === 'journal_entry') {
    const { data } = await supabase.from('journal_entries').select('*').eq('id', opts.sourceId).single()
    if (!data) return { extracted: 0, skipped: 0 }
    content = [data.focus, data.accomplished, data.needs_attention, data.reflection]
      .filter(Boolean).join('\n\n')
    date = data.entry_date
  } else {
    const { data } = await supabase.from('transcripts').select('*').eq('id', opts.sourceId).single()
    if (!data) return { extracted: 0, skipped: 0 }
    content   = data.raw_transcript ?? data.summary ?? ''
    date      = data.meeting_date ?? data.created_at?.slice(0, 10) ?? date
    attendees = data.attendees ?? ''
  }

  if (!content.trim()) return { extracted: 0, skipped: 0 }

  // Run extraction per project
  for (const projectId of opts.projectIds) {
    const { data: proj } = await supabase.from('projects').select('name').eq('id', projectId).single()
    if (!proj) continue

    const candidates = await extractDecisionsFromContent({
      content,
      date,
      projectName: proj.name,
      attendees,
    })

    for (const c of candidates) {
      const dup = await isDuplicate(projectId, c.content)
      if (dup) { skipped++; continue }

      const status = c.confidence === 'high' ? 'active' : 'pending_review'
      await supabase.from('decisions').insert({
        project_id:  projectId,
        user_id:     opts.userId,
        content:     c.content,
        source_type: opts.sourceType,
        source_id:   opts.sourceId,
        date,
        people:      c.people ?? [],
        confidence:  c.confidence,
        excerpt:     c.excerpt ?? null,
        status,
      })
      extracted++
    }
  }

  return { extracted, skipped }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const segments = getSegments(req)
  // segments: ['api', 'decisions', ...rest]
  const rest     = segments.slice(2) // e.g. [], ['extract'], ['backfill'], [':id']

  try {
    // ── POST /api/decisions/extract ─────────────────────────────────────────
    if (req.method === 'POST' && rest[0] === 'extract') {
      const { source_type, source_id, project_ids, user_id } = req.body ?? {}
      if (!source_type || !source_id || !Array.isArray(project_ids) || !user_id) {
        return res.status(400).json({ error: 'source_type, source_id, project_ids, user_id required' })
      }
      const result = await runExtraction({ sourceType: source_type, sourceId: source_id, projectIds: project_ids, userId: user_id })
      return res.status(200).json(result)
    }

    // ── POST /api/decisions/backfill ────────────────────────────────────────
    if (req.method === 'POST' && rest[0] === 'backfill') {
      const { project_id, user_id } = req.body ?? {}
      if (!project_id || !user_id) return res.status(400).json({ error: 'project_id and user_id required' })

      // Gather all journal entries and meeting notes for this project
      const [{ data: jp }, { data: tp }] = await Promise.all([
        supabase.from('journal_entry_projects').select('journal_entry_id').eq('project_id', project_id),
        supabase.from('transcript_projects').select('transcript_id').eq('project_id', project_id),
      ])

      let totalExtracted = 0
      let totalSkipped   = 0

      for (const row of (jp ?? [])) {
        const r = await runExtraction({
          sourceType: 'journal_entry', sourceId: row.journal_entry_id,
          projectIds: [project_id], userId: user_id,
        })
        totalExtracted += r.extracted
        totalSkipped   += r.skipped
      }

      for (const row of (tp ?? [])) {
        const r = await runExtraction({
          sourceType: 'meeting_note', sourceId: row.transcript_id,
          projectIds: [project_id], userId: user_id,
        })
        totalExtracted += r.extracted
        totalSkipped   += r.skipped
      }

      return res.status(200).json({ extracted: totalExtracted, skipped: totalSkipped, status: 'done' })
    }

    // ── GET /api/decisions ──────────────────────────────────────────────────
    if (req.method === 'GET' && rest.length === 0) {
      const { project_id, status, limit = '50' } = req.query as Record<string, string>
      if (!project_id) return res.status(400).json({ error: 'project_id required' })

      let q = supabase
        .from('decisions')
        .select('*')
        .eq('project_id', project_id)
        .order('date', { ascending: false })
        .limit(parseInt(limit))

      if (status) q = q.eq('status', status)
      else        q = q.neq('status', 'dismissed')  // default: all non-dismissed

      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ decisions: data ?? [] })
    }

    // ── POST /api/decisions (manual create) ─────────────────────────────────
    if (req.method === 'POST' && rest.length === 0) {
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

    // ── PATCH /api/decisions/:id ─────────────────────────────────────────────
    if (req.method === 'PATCH' && rest[0] && rest[0] !== 'extract' && rest[0] !== 'backfill') {
      const decisionId = rest[0]
      const allowed    = ['content', 'status', 'superseded_by', 'people', 'notes']
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const key of allowed) {
        if (key in (req.body ?? {})) patch[key] = req.body[key]
      }
      const { data, error } = await supabase.from('decisions').update(patch).eq('id', decisionId).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ decision: data })
    }

    // ── DELETE /api/decisions/:id ────────────────────────────────────────────
    if (req.method === 'DELETE' && rest[0]) {
      const decisionId = rest[0]
      // Only allow delete for manual or dismissed decisions
      const { data: existing } = await supabase.from('decisions').select('source_type, status').eq('id', decisionId).single()
      if (!existing) return res.status(404).json({ error: 'Not found' })
      if (existing.source_type !== 'manual' && existing.status !== 'dismissed') {
        return res.status(403).json({ error: 'Only manual or dismissed decisions can be deleted' })
      }
      await supabase.from('decisions').delete().eq('id', decisionId)
      return res.status(204).end()
    }

    return res.status(404).json({ error: 'Not found' })
  } catch (err) {
    console.error('decisions error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' })
  }
}
