import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.0-flash'
const MAX_CHARS = 8_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text } = (req.body ?? {}) as { text?: string }
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  const isHtml = text.trim().startsWith('<')
  const input = text.slice(0, MAX_CHARS)

  const systemPrompt = isHtml
    ? 'You are a writing assistant. The user will give you HTML content. Improve grammar, clarity, and flow while preserving meaning and all HTML tags exactly. Keep the tone professional and concise. Do not add new information. Return only the improved HTML, no commentary.'
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
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
