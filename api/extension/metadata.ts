import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function validateToken(token: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('api_tokens')
    .select('user_id')
    .eq('token', token)
    .single()
  return data?.user_id ?? null
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

  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
  const [{ data: projects }, { data: tags }, { data: attendees }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('user_id', userId).order('name'),
    supabase.from('tags').select('id, name').eq('user_id', userId).order('name'),
    supabase.from('attendees').select('id, name').eq('user_id', userId).order('name'),
  ])

  return res.status(200).json({
    projects: (projects ?? []).map((p: any) => p.name),
    tags: (tags ?? []).map((t: any) => t.name),
    attendees: (attendees ?? []).map((a: any) => a.name),
  })
}
