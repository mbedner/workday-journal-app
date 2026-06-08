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

function buildSystemPrompt(projectName: string): string {
  return `You are a strict decision auditor extracting only the most significant decisions from a meeting note about "${projectName}".

Your job is to be HIGHLY SELECTIVE. A typical meeting should yield 0–3 decisions. Extracting nothing is correct and expected for many meetings. Never pad the list.

── PROJECT FILTER ────────────────────────────────────────────────────────────
This meeting may span multiple projects. Only extract decisions that directly concern "${projectName}". Ignore everything else.

── THE BAR ───────────────────────────────────────────────────────────────────
Before extracting anything, ask: "Would this decision be written down in a permanent architecture doc, a product spec, or a project retrospective — and would it still matter six months from now?"

If the answer is not a clear YES, do not extract it. When in doubt, leave it out.

── DO NOT EXTRACT (these are the most common false positives) ────────────────
✗ Any task, action item, or follow-up ("we'll look into X", "Alice will update the docs")
✗ Scheduling or logistics ("stand-up moves to Thursday", "next review is Friday")
✗ Things that are still under discussion, provisional, or need more research
✗ Status updates or progress reports ("the feature is 80% done")
✗ Restatements of existing policy or prior decisions
✗ Minor implementation details that any developer would decide independently
✗ UI/UX preferences without an explicit commitment and clear reasoning
✗ Anything where the "decision" is just the obvious or only option
✗ Process suggestions that haven't been formally adopted
✗ Anything you are inferring rather than reading explicitly in the text

── DO EXTRACT (only these, and only when explicitly stated) ──────────────────
✓ A deliberate choice between two or more real alternatives, with explicit commitment
✓ A confirmed scope boundary: something explicitly included in or excluded from the project
✓ A technology, architecture, or integration choice that was finalised (not just discussed)
✓ A formal policy or ownership rule adopted by the team (not just suggested)
✓ Something the team has explicitly decided NOT to do, with reasoning

── DECISION TYPES ────────────────────────────────────────────────────────────
- "strategic"   — Shapes what the project IS or is NOT: goals, scope, positioning, explicit exclusions
- "tactical"    — A finalised technical or implementation choice between real alternatives
- "operational" — A formal team-wide process or ownership rule with lasting effect (not a one-off action)

── CONFIDENCE ────────────────────────────────────────────────────────────────
- "high"   — Explicit commitment in the text; no ambiguity
- "medium" — Clear strong direction but not 100% explicit; use sparingly

Do NOT return "low" confidence items. If you're uncertain, do not extract.

── OUTPUT ────────────────────────────────────────────────────────────────────
Return a JSON array of at most 5 items. If no decisions meet the bar, return [].
Each item must have all five fields:
{
  "content":    "concise present-tense statement of the decision, 10–25 words",
  "type":       "strategic" | "tactical" | "operational",
  "confidence": "high" | "medium",
  "people":     ["Full Name of anyone specifically named in the context of this decision"],
  "excerpt":    "the exact sentence or phrase from the source that supports this extraction"
}`
}

async function callGemini(apiKey: string, body: object): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
}

async function extractDecisionsFromContent(opts: {
  content:      string
  date:         string
  projectName:  string
  attendees:    string
}): Promise<Array<{ content: string; type: 'strategic' | 'tactical' | 'operational'; confidence: 'high' | 'medium' | 'low'; people: string[]; excerpt: string }>> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return []

  const stripped = opts.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, MAX_CHARS)
  const userPrompt = [
    `Entry date: ${opts.date}`,
    `Project: ${opts.projectName}`,
    `People involved: ${opts.attendees || 'none listed'}`,
    `Content:\n${stripped}`,
  ].join('\n')

  const geminiBody = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(opts.projectName) }] },
    contents:          [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature:    0.1,
      maxOutputTokens: 8192,
    },
  }

  try {
    const response = await callGemini(apiKey, geminiBody)
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

    const raw = await extractDecisionsFromContent({
      content,
      date,
      projectName: proj.name,
      attendees,
    })

    // Hard guardrails: drop low-confidence noise, cap at 5 per source
    const candidates = raw
      .filter(c => c.confidence === 'high' || c.confidence === 'medium')
      .slice(0, 5)

    for (const c of candidates) {
      const dup = await isDuplicate(projectId, c.content)
      if (dup) { skipped++; continue }

      const status = c.confidence === 'high' ? 'active' : 'pending_review'
      await supabase.from('decisions').insert({
        project_id:  projectId,
        user_id:     opts.userId,
        content:     c.content,
        type:        c.type   ?? null,
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

      // Decisions are extracted from meeting notes only
      const { data: tp } = await supabase
        .from('transcript_projects').select('transcript_id').eq('project_id', project_id)

      let totalExtracted = 0
      let totalSkipped   = 0

      // Process up to 10 transcripts per run. Jaccard dedup inside runExtraction
      // handles skipping content already extracted. Run again to process older notes.
      const rows = (tp ?? []).slice(0, 10)
      console.log(`backfill: ${(tp ?? []).length} total transcripts, processing ${rows.length}`)

      for (const row of rows) {
        const r = await runExtraction({
          sourceType: 'meeting_note', sourceId: row.transcript_id,
          projectIds: [project_id], userId: user_id,
        })
        totalExtracted += r.extracted
        totalSkipped   += r.skipped
      }

      return res.status(200).json({ extracted: totalExtracted, skipped: totalSkipped, status: 'done' })
    }

    // ── POST /api/decisions/purge ───────────────────────────────────────────
    // Deletes all decisions for a project matching a given source_type.
    // Intended for cleanup of old journal-extracted decisions.
    if (req.method === 'POST' && rest[0] === 'purge') {
      const { project_id, source_type } = req.body ?? {}
      if (!project_id || !source_type) {
        return res.status(400).json({ error: 'project_id and source_type required' })
      }
      const { count, error } = await supabase
        .from('decisions')
        .delete({ count: 'exact' })
        .eq('project_id', project_id)
        .eq('source_type', source_type)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ deleted: count ?? 0 })
    }

    // ── PATCH /api/decisions/:id ─────────────────────────────────────────────
    if (req.method === 'PATCH' && rest[0] && rest[0] !== 'extract' && rest[0] !== 'backfill') {
      const decisionId = rest[0]
      const allowed    = ['content', 'type', 'status', 'superseded_by', 'people', 'notes']
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
