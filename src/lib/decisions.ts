import { Decision } from '../types'

const BASE = '/api/decisions'

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchDecisions(
  projectId: string,
  status?: string,
  limit = 50
): Promise<Decision[]> {
  const params = new URLSearchParams({ project_id: projectId, limit: String(limit) })
  if (status) params.set('status', status)
  const res  = await fetch(`${BASE}?${params}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Failed to load decisions')
  return json.decisions ?? []
}

// ── Create (manual) ───────────────────────────────────────────────────────────

export async function createDecision(payload: {
  project_id:  string
  user_id:     string
  content:     string
  date:        string
  type?:       string
  source_type?: 'manual' | 'meeting_note'
  source_id?:  string | null
  people?:     string[]
  notes?:      string
}): Promise<Decision> {
  const res  = await fetch(BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Failed to create decision')
  return json.decision
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateDecision(
  id: string,
  patch: Partial<Pick<Decision, 'content' | 'type' | 'status' | 'superseded_by' | 'people' | 'notes'>>
): Promise<Decision> {
  const res  = await fetch(`${BASE}/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Failed to update decision')
  return json.decision
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteDecision(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? 'Failed to delete decision')
  }
}

// ── Trigger extraction (fire-and-forget from save handlers) ──────────────────

export function triggerExtraction(opts: {
  sourceType: 'journal_entry' | 'meeting_note'
  sourceId:   string
  projectIds: string[]
  userId:     string
}): void {
  fetch(`${BASE}/extract`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      source_type: opts.sourceType,
      source_id:   opts.sourceId,
      project_ids: opts.projectIds,
      user_id:     opts.userId,
    }),
  }).catch(() => { /* silent — never block the save */ })
}

// ── Purge by source type ──────────────────────────────────────────────────────

export async function purgeDecisionsBySource(
  projectId: string,
  sourceType: 'journal_entry' | 'manual' | 'meeting_note'
): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/purge`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ project_id: projectId, source_type: sourceType }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Purge failed')
  return json
}

// ── Backfill ──────────────────────────────────────────────────────────────────

export async function backfillDecisions(
  projectId: string,
  userId: string,
  offset = 0,
): Promise<{ extracted: number; skipped: number; remaining: number; nextOffset: number }> {
  const res  = await fetch(`${BASE}/backfill`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ project_id: projectId, user_id: userId, offset }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Backfill failed')
  return json
}
