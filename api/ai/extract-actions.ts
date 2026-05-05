import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.5-flash'
const MAX_CHARS = 12_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { transcript } = (req.body ?? {}) as { transcript?: string }
  if (!transcript?.trim()) return res.status(400).json({ error: 'No transcript provided' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  const input = transcript.replace(/<[^>]+>/g, ' ').slice(0, MAX_CHARS)

  const systemPrompt = `You extract structured information from meeting notes and transcripts.
Return clear, concise action items, decisions, and follow-ups.
Do not hallucinate — only use information present in the text.
For each item include:
- "title": a short, specific task title (start with a verb, 5-10 words, enough context to stand alone)
- "context": 1-2 sentences of background explaining why this matters or what was discussed

Respond with valid JSON in exactly this shape:
{
  "action_items": [{ "title": "string", "context": "string" }, ...],
  "decisions": [{ "title": "string", "context": "string" }, ...],
  "follow_ups": [{ "title": "string", "context": "string" }, ...]
}
Each array may be empty if nothing relevant was found. No other text.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
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
    // Normalise: accept both old string[] and new {title,context}[] shapes
    const normalise = (arr: unknown[]): { title: string; context: string }[] =>
      (arr ?? []).map(item =>
        typeof item === 'string'
          ? { title: item, context: '' }
          : { title: (item as any).title ?? '', context: (item as any).context ?? '' }
      )
    return res.status(200).json({
      action_items: normalise(parsed.action_items),
      decisions:    normalise(parsed.decisions),
      follow_ups:   normalise(parsed.follow_ups),
    })
  } catch (err) {
    console.error('ai/extract-actions error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
