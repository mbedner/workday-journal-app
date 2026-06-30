import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.5-flash'
const MAX_CHARS = 12_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, notes } = (req.body ?? {}) as { name?: string; notes?: string[] }
  if (!name?.trim()) return res.status(400).json({ error: 'No name provided' })
  if (!notes?.length) return res.status(400).json({ error: 'No notes provided' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  const notesText = notes
    .map((n, i) => `Note ${i + 1}: ${n}`)
    .join('\n\n')
    .slice(0, MAX_CHARS)

  const systemPrompt = `You are a personal assistant helping someone maintain a lightweight knowledge base about the people in their professional life.
Write a concise, factual summary about ${name} based on the notes provided.
Write in third person. Be direct and informative — no filler phrases like "Based on the notes..." or "It appears that...".
Cover what's most useful: who they are, what they do, key personal context, and anything worth remembering.
Aim for 2–4 sentences. Return only the summary, no labels or headers.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: notesText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) throw new Error(data?.error?.message ?? `Gemini ${response.status}`)

    const summary: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!summary) throw new Error('Empty response from AI')

    return res.status(200).json({ summary })
  } catch (err) {
    console.error('ai/person-snapshot error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
