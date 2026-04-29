import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.0-flash'

interface JournalItem {
  date: string
  focus?: string
  accomplished?: string
  needs_attention?: string
  reflection?: string
}
interface TaskItem { title: string; status: string }
interface TranscriptItem { title: string; date?: string; content?: string }

interface Payload {
  weekLabel?: string
  journals?: JournalItem[]
  completedTasks?: TaskItem[]
  openTasks?: TaskItem[]
  transcripts?: TranscriptItem[]
}

function strip(text: string | undefined): string {
  if (!text) return ''
  return text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function buildContext(payload: Payload): string {
  const lines: string[] = [`Week: ${payload.weekLabel ?? 'unknown'}\n`]

  if (payload.journals?.length) {
    lines.push('## Journal Entries')
    for (const j of payload.journals) {
      lines.push(`### ${j.date}`)
      if (j.focus)           lines.push(`Focus: ${strip(j.focus)}`)
      if (j.accomplished)    lines.push(`Accomplished: ${strip(j.accomplished)}`)
      if (j.needs_attention) lines.push(`Still needs attention: ${strip(j.needs_attention)}`)
      if (j.reflection)      lines.push(`Reflection: ${strip(j.reflection)}`)
    }
  }

  if (payload.completedTasks?.length) {
    lines.push('\n## Completed Tasks')
    payload.completedTasks.forEach(t => lines.push(`- ${t.title}`))
  }

  if (payload.openTasks?.length) {
    lines.push('\n## Open / In-Progress Tasks')
    payload.openTasks.forEach(t => lines.push(`- [${t.status}] ${t.title}`))
  }

  if (payload.transcripts?.length) {
    lines.push('\n## Meeting Notes')
    for (const t of payload.transcripts) {
      lines.push(`### ${t.title}${t.date ? ` (${t.date})` : ''}`)
      if (t.content) lines.push(strip(t.content).slice(0, 800))
    }
  }

  return lines.join('\n').slice(0, 14_000)
}

const systemPrompt = `You are a product design lead summarizing a week of work.
Be concise, structured, and professional. Focus on meaningful output, not busywork.
Respond with valid JSON in exactly this shape — no extra text:
{
  "summary": "2-3 sentence paragraph",
  "accomplishments": ["string", ...],
  "decisions": ["string", ...],
  "open_items": ["string", ...],
  "blockers": ["string", ...],
  "next_steps": ["string", ...]
}
Each string array may be empty. Keep each bullet under 120 characters.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  const payload = (req.body ?? {}) as Payload
  const context = buildContext(payload)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: context }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1536,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Gemini ${response.status}`)
    }
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(raw)
    return res.status(200).json({
      summary: parsed.summary ?? '',
      accomplishments: parsed.accomplishments ?? [],
      decisions: parsed.decisions ?? [],
      open_items: parsed.open_items ?? [],
      blockers: parsed.blockers ?? [],
      next_steps: parsed.next_steps ?? [],
    })
  } catch (err) {
    console.error('ai/weekly-recap error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
