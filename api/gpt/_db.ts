/**
 * Shared Supabase REST client + auth helpers for the GPT connector endpoints.
 * Uses the service role key so queries bypass RLS — always filter by userId.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─────────────────────────────────────────────────────────────────────────────
// DB client
// ─────────────────────────────────────────────────────────────────────────────

export function db() {
  const url  = process.env.SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set')

  const base = `${url}/rest/v1`
  const h: Record<string, string> = {
    apikey:        key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }

  return {
    async select(table: string, qs: string): Promise<any[]> {
      const r = await fetch(`${base}/${table}?${qs}`, { headers: h })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },

    async insert(table: string, body: object): Promise<any> {
      const r = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] : rows
    },

    async upsert(table: string, body: object, onConflict: string): Promise<any> {
      const r = await fetch(`${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] : rows
    },

    async patch(table: string, qs: string, body: object): Promise<any> {
      const r = await fetch(`${base}/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] : rows
    },

    patchAsync(table: string, qs: string, body: object) {
      fetch(`${base}/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }).catch(() => {})
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export async function validateToken(token: string): Promise<string | null> {
  const client = db()
  const rows = await client.select(
    'api_tokens',
    `token=eq.${encodeURIComponent(token)}&select=id,user_id`,
  )
  if (!rows.length) return null
  client.patchAsync('api_tokens', `id=eq.${rows[0].id}`, {
    last_used_at: new Date().toISOString(),
  })
  return rows[0].user_id
}

/**
 * Validates the Bearer token and returns the userId, or sends a 401 and
 * returns null so the caller can bail out early.
 */
export async function authenticate(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  const authHeader = (req.headers.authorization ?? '') as string
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json(err('UNAUTHORIZED', 'Missing Authorization header'))
    return null
  }
  try {
    const userId = await validateToken(token)
    if (!userId) {
      res.status(401).json(err('UNAUTHORIZED', 'Invalid or expired token'))
      return null
    }
    return userId
  } catch (e: any) {
    res.status(500).json(err('SERVER_ERROR', e.message))
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

export function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Strip HTML tags and collapse whitespace */
export function strip(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** Clamp a numeric value between 1 and max */
export function clamp(value: unknown, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return max
  return Math.min(Math.max(1, Math.floor(n)), max)
}

/** Standard error envelope */
export function err(code: string, message: string) {
  return { error: { code, message } }
}

/** Extract project names from the PostgREST embed shape */
export function projectNames(row: any, joinKey: string, fkKey: string): string[] {
  return (row[joinKey] ?? [])
    .map((j: any) => j[fkKey]?.name)
    .filter(Boolean) as string[]
}

/** Extract tag names from the PostgREST embed shape */
export function tagNames(row: any, joinKey: string, fkKey: string): string[] {
  return (row[joinKey] ?? [])
    .map((j: any) => j[fkKey]?.name)
    .filter(Boolean) as string[]
}
