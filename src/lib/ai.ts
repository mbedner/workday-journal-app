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

export function cleanUpWriting(text: string, mode?: 'journal' | 'meeting'): Promise<CleanupResult> {
  return post('/cleanup', { text, mode })
}

// ─── Feature 1b: Summarize Meeting ───────────────────────────────────────────

export interface SummarizeMeetingResult {
  summary: string
}

export function summarizeMeeting(transcript: string): Promise<SummarizeMeetingResult> {
  return post('/summarize-meeting', { transcript })
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

export interface ExtractedItem {
  title: string
  context: string
}

export interface ExtractedActions {
  action_items: ExtractedItem[]
  decisions: ExtractedItem[]
  follow_ups: ExtractedItem[]
}

export function extractTranscriptActions(transcript: string): Promise<ExtractedActions> {
  return post('/extract-actions', { transcript })
}

// ─── Feature 4: Ask Your Data ─────────────────────────────────────────────────

export interface SearchableRecord {
  id: string
  type: 'journal' | 'task' | 'transcript'
  title: string
  date?: string
  body: string
  status?: string
  projects: string[]
  tags: string[]
  url: string
}

export interface AskDataSource {
  id: string
  type: 'journal' | 'task' | 'transcript'
  title: string
  date?: string
  preview: string
  url: string
}

export interface AskDataResult {
  answer: string
  sources: AskDataSource[]
}

export function askData(question: string, records: SearchableRecord[]): Promise<AskDataResult> {
  return post('/ask-data', { question, records })
}
