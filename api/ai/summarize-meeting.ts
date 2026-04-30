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

  const systemPrompt = `You write concise executive summaries of meeting notes.
Write exactly 2-3 sentences that capture: the purpose of the meeting, the most important outcome or decision, and any key next step.
Be specific — use names, topics, and numbers where present in the notes.
Write in plain prose. No bullet points, no headers, no markdown.
Return only the summary, no preamble or commentary.`

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
            maxOutputTokens: 256,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Gemini ${response.status}`)
    }
    const summary: string = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    return res.status(200).json({ summary })
  } catch (err) {
    console.error('ai/summarize-meeting error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
