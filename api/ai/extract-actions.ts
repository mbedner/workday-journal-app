import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.0-flash'
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
Respond with valid JSON in exactly this shape:
{
  "action_items": ["string", ...],
  "decisions": ["string", ...],
  "follow_ups": ["string", ...]
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
            maxOutputTokens: 1024,
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
      action_items: parsed.action_items ?? [],
      decisions: parsed.decisions ?? [],
      follow_ups: parsed.follow_ups ?? [],
    })
  } catch (err) {
    console.error('ai/extract-actions error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
