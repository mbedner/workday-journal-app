/**
 * POST /api/gpt/reflections
 *
 * Save a GPT-generated reflection back to the journal.
 * Creates or updates the journal entry for the given date, writing
 * the GPT content into the `reflection` field.
 *
 * Request body:
 *   date    YYYY-MM-DD (required)
 *   title   string (optional, stored as focus if no existing focus)
 *   body    string (required) — the GPT-generated reflection
 *   source  string (optional, e.g. "operator-gpt")
 *   tags    string[] (optional)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, db, err, setCors } from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Use POST'))

  const userId = await authenticate(req, res)
  if (!userId) return

  const body = (req.body ?? {}) as {
    date?: string
    title?: string
    body?: string
    source?: string
    tags?: string[]
  }

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return res.status(400).json(err('INVALID_DATE', 'date is required and must be YYYY-MM-DD'))
  }
  if (!body.body?.trim()) {
    return res.status(400).json(err('MISSING_PARAMS', 'body is required'))
  }

  const source = body.source ? `\n\n*Source: ${body.source}*` : ''
  const reflectionText = body.body.trim() + source

  try {
    const client = db()

    // Check if an entry already exists for this date
    const existing = await client.select(
      'journal_entries',
      `user_id=eq.${userId}&entry_date=eq.${body.date}&select=id,focus,reflection`,
    )

    let entryId: string

    if (existing.length) {
      // Append to existing reflection (don't overwrite)
      const prev = existing[0]
      const combined = [prev.reflection?.trim(), reflectionText].filter(Boolean).join('\n\n---\n\n')
      await client.patch(
        'journal_entries',
        `id=eq.${prev.id}`,
        { reflection: combined, updated_at: new Date().toISOString() },
      )
      entryId = prev.id
    } else {
      // Create a new journal entry
      const inserted = await client.insert('journal_entries', {
        user_id:    userId,
        entry_date: body.date,
        focus:      body.title?.trim() || null,
        reflection: reflectionText,
      })
      entryId = inserted.id
    }

    return res.status(201).json({
      id:     entryId,
      status: existing.length ? 'appended' : 'created',
      date:   body.date,
    })
  } catch (e: any) {
    console.error('gpt/reflections error', e)
    return res.status(500).json(err('SERVER_ERROR', e.message))
  }
}
