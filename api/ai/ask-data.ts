import type { VercelRequest, VercelResponse } from '@vercel/node'

const MODEL = 'gemini-2.5-flash'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { question, records } = (req.body ?? {}) as {
    question?: string
    records?: SearchableRecord[]
  }

  if (!question?.trim()) return res.status(400).json({ error: 'No question provided' })
  if (!records?.length) {
    return res.status(200).json({
      answer: "I couldn't find enough saved data to answer that. Try asking about a specific project, date range, meeting, or task.",
      sources: [],
    })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' })

  // Build context from records
  const context = records.map(r => {
    const parts = [
      `[${r.id}] ${r.type.toUpperCase()}: ${r.title}`,
      r.date ? `Date: ${r.date}` : '',
      r.status ? `Status: ${r.status}` : '',
      r.projects.length ? `Projects: ${r.projects.join(', ')}` : '',
      r.tags.length ? `Tags: ${r.tags.join(', ')}` : '',
      r.body ? `Content: ${r.body.slice(0, 600)}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n---\n\n')

  const isBroad = records.length >= 25
  const broadNote = isBroad ? 'Note: I\'m summarizing the most relevant recent records I found.\n\n' : ''

  const systemPrompt = `You are an assistant inside a personal work journal app called Workday Journal.

Only answer using the provided user data below. Do not invent facts, tasks, meetings, decisions, or dates.

If the provided data does not answer the question, say so clearly: "I couldn't find enough saved data to answer that."

Keep responses concise, practical, and well organized. When useful, group the answer by project, date, task status, or theme. Use short bullet points or numbered lists for clarity.

After your answer, list the IDs of the records you actually used (only those directly referenced in your answer).

Respond in valid JSON with this exact shape:
{
  "answer": "your answer here",
  "source_ids": ["id1", "id2"]
}

No other text outside the JSON.`

  const userMessage = `Question:\n${question}\n\nRelevant user data:\n${broadNote}${context}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
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
    const answer: string = parsed.answer ?? "I couldn't find enough saved data to answer that."
    const sourceIds: string[] = parsed.source_ids ?? []

    // Map source IDs back to full source objects
    const recordMap = new Map(records.map(r => [r.id, r]))
    const sources: AskDataSource[] = sourceIds
      .map(sid => recordMap.get(sid))
      .filter((r): r is SearchableRecord => !!r)
      .map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        date: r.date,
        preview: r.body.slice(0, 120).trim() + (r.body.length > 120 ? '…' : ''),
        url: r.url,
      }))

    return res.status(200).json({ answer, sources })
  } catch (err) {
    console.error('ai/ask-data error', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Ask Your Data is unavailable right now. Try again.',
    })
  }
}
