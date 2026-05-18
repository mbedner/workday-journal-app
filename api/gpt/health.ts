import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors } from './_db'

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  return res.status(200).json({
    status: 'ok',
    app: 'workday-journal',
    version: '1.0.0',
  })
}
