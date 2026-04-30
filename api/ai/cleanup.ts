import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.5-flash'
const MAX_CHARS = 8_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text, mode } = (req.body ?? {}) as { text?: string; mode?: string }
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  const isHtml = text.trim().startsWith('<')
  const input = text.slice(0, MAX_CHARS)

  const isJournal = mode === 'journal'
  const systemPrompt = isHtml
    ? isJournal
      ? 'You are a writing assistant helping someone clean up their personal work journal. Fix grammar and awkward phrasing, and lightly flesh out the writing — add a bit of context, smooth transitions, or a sentence of elaboration where it helps. The goal is to make it sound like the person sat down and wrote it thoughtfully, not like it was polished by a committee. Preserve all HTML tags exactly. Keep the voice personal, honest, and grounded — not corporate. Return only the improved HTML, no commentary.'
      : 'You are a writing assistant helping someone clean up their meeting notes. Fix grammar, tighten up run-on sentences, and improve the flow — but keep it sounding like a real person wrote it, not a press release. Use natural, direct language. Vary sentence length. Avoid business jargon. Preserve all HTML tags exactly. Do not add new information. Return only the improved HTML, no commentary.'
    : isJournal
      ? 'You are a writing assistant helping someone clean up their personal work journal. Fix grammar and awkward phrasing, and lightly flesh out the writing — add a bit of context, smooth transitions, or a sentence of elaboration where it helps. The goal is to make it sound like the person sat down and wrote it thoughtfully, not like it was polished by a committee. Keep the voice personal, honest, and grounded — not corporate. Return only the improved text, no commentary.'
      : 'You are a writing assistant helping someone clean up their meeting notes. Fix grammar, tighten up run-on sentences, and improve the flow — but keep it sounding like a real person wrote it, not a press release. Use natural, direct language. Vary sentence length. Avoid business jargon. Do not add new information. Return only the improved text, no commentary.'

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Gemini ${response.status}`)
    }
    const cleaned_text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return res.status(200).json({ cleaned_text })
  } catch (err) {
    console.error('ai/cleanup error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'AI assist unavailable. Try again.' })
  }
}
