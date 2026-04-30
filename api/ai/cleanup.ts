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
      ? 'You are a writing assistant. The user will give you HTML journal notes. Fix grammar and clarity, and lightly expand the writing — add brief context, transition phrases, or a sentence of elaboration where it improves readability. The result should feel a bit more polished and complete than the original, but stay grounded in what was written. Preserve all HTML tags exactly. Keep the tone professional and reflective. Return only the improved HTML, no commentary.'
      : 'You are a writing assistant. The user will give you HTML content. Improve grammar, clarity, and flow while preserving meaning and all HTML tags exactly. Keep the tone professional and concise. Do not add new information. Return only the improved HTML, no commentary.'
    : isJournal
      ? 'You are a writing assistant. Fix grammar and clarity, and lightly expand the writing — add brief context, transition phrases, or a sentence of elaboration where it improves readability. The result should feel a bit more polished and complete than the original, but stay grounded in what was written. Keep the tone professional and reflective. Return only the improved text, no commentary.'
      : 'You are a writing assistant. Improve grammar, clarity, and flow while preserving meaning. Keep the tone professional and concise. Do not add new information. Return only the improved text, no commentary.'

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
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
