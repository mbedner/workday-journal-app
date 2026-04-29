/** Thin client wrappers around the /api/ai/* Vercel serverless endpoints. */

const BASE = '/api/ai'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'AI assist unavailable. Try again.')
  return json as T
}

// ─── Feature 1: Clean Up Writing ────────────────────────────────────────────

export interface CleanupResult {
  cleaned_text: string
}

export function cleanUpWriting(text: string): Promise<CleanupResult> {
  return post('/cleanup', { text })
}

// ─── Feature 2: Weekly Recap ─────────────────────────────────────────────────

export interface WeeklyRecapInput {
  weekLabel: string
  journals: Array<{
    date: string
    focus?: string
    accomplished?: string
    needs_attention?: string
    reflection?: string
  }>
  completedTasks: Array<{ title: string; status: string }>
  openTasks: Array<{ title: string; status: string }>
  transcripts: Array<{ title: string; date?: string; content?: string }>
}

export interface WeeklyRecap {
  summary: string
  accomplishments: string[]
  decisions: string[]
  open_items: string[]
  blockers: string[]
  next_steps: string[]
}

export function generateWeeklyRecap(data: WeeklyRecapInput): Promise<WeeklyRecap> {
  return post('/weekly-recap', data)
}

// ─── Feature 3: Extract Action Items ─────────────────────────────────────────

export interface ExtractedActions {
  action_items: string[]
  decisions: string[]
  follow_ups: string[]
}

export function extractTranscriptActions(transcript: string): Promise<ExtractedActions> {
  return post('/extract-actions', { transcript })
}
