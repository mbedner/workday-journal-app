import type { VercelRequest, VercelResponse } from '@vercel/node'

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are not set')
  const base = `${url}/rest/v1`
  const h: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  return {
    async select(table: string, qs: string): Promise<any[]> {
      const res = await fetch(`${base}/${table}?${qs}`, { headers: h })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  }
}

async function validateToken(token: string): Promise<string | null> {
  const rows = await db().select('api_tokens', `token=eq.${encodeURIComponent(token)}&select=user_id`)
  return rows[0]?.user_id ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let userId: string | null
  try {
    userId = await validateToken(token)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
  if (!userId) return res.status(401).json({ error: 'Invalid or expired token' })

  try {
    const client = db()
    const [projects, tags, attendees] = await Promise.all([
      client.select('projects', `user_id=eq.${userId}&select=name&order=name`),
      client.select('tags', `user_id=eq.${userId}&select=name&order=name`),
      client.select('attendees', `user_id=eq.${userId}&select=name&order=name`),
    ])
    return res.status(200).json({
      projects: projects.map(p => p.name),
      tags: tags.map(t => t.name),
      attendees: attendees.map(a => a.name),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
