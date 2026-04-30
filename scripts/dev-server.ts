/**
 * Local dev API server — mirrors the three Vercel serverless functions so you
 * can run `npm run dev` instead of `vercel dev`.  Vite proxies /api/* here.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env manually (Node 20.6+ --env-file works, but this is portable)
try {
  const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  for (const line of env.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env not found, rely on environment */ }

const PORT = 3001

const ROUTES: Record<string, string> = {
  '/api/ai/cleanup':           '../api/ai/cleanup.ts',
  '/api/ai/weekly-recap':      '../api/ai/weekly-recap.ts',
  '/api/ai/extract-actions':   '../api/ai/extract-actions.ts',
  '/api/ai/summarize-meeting': '../api/ai/summarize-meeting.ts',
  '/api/ai/ask-data':          '../api/ai/ask-data.ts',
}

/** Minimal shims so the Vercel handler signatures work as-is */
function makeAdapter(nodeReq: IncomingMessage, nodeRes: ServerResponse, body: unknown) {
  const req = { method: nodeReq.method, body, headers: nodeReq.headers }

  const res = {
    _code: 200,
    status(code: number) { this._code = code; return this },
    json(data: unknown) {
      nodeRes.writeHead(this._code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      nodeRes.end(JSON.stringify(data))
    },
  }

  return { req, res }
}

createServer(async (nodeReq, nodeRes) => {
  // CORS preflight
  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
    nodeRes.end()
    return
  }

  const url = nodeReq.url?.split('?')[0] ?? ''
  const modulePath = ROUTES[url]

  if (!modulePath) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' })
    nodeRes.end(JSON.stringify({ error: `No dev handler for ${url}` }))
    return
  }

  let raw = ''
  for await (const chunk of nodeReq) raw += chunk
  const body = raw ? JSON.parse(raw) : {}

  const { req, res } = makeAdapter(nodeReq, nodeRes, body)

  try {
    const mod = await import(modulePath)
    await mod.default(req, res)
  } catch (err) {
    console.error(err)
    nodeRes.writeHead(500, { 'Content-Type': 'application/json' })
    nodeRes.end(JSON.stringify({ error: 'Internal server error' }))
  }
}).listen(PORT, () => {
  console.log(`  \x1b[36m➜\x1b[0m  API dev server: \x1b[1mhttp://localhost:${PORT}\x1b[0m`)
})
