/**
 * Local dev API server — mirrors the Vercel serverless functions so you
 * can run `npm run dev` instead of `vercel dev`.  Vite proxies /api/* here.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { URL } from 'node:url'

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
  // AI endpoints (POST)
  '/api/ai/cleanup':           '../api/ai/cleanup.ts',
  '/api/ai/weekly-recap':      '../api/ai/weekly-recap.ts',
  '/api/ai/extract-actions':   '../api/ai/extract-actions.ts',
  '/api/ai/summarize-meeting': '../api/ai/summarize-meeting.ts',
  '/api/ai/ask-data':          '../api/ai/ask-data.ts',
  // Extension endpoints (POST)
  '/api/extension/capture':    '../api/extension/capture.ts',
  '/api/extension/metadata':   '../api/extension/metadata.ts',
  // GPT connector endpoints (GET / POST) — routed directly to _ prefixed handlers
  '/api/gpt/health':           '../api/gpt/_health.ts',
  '/api/gpt/journal-entries':  '../api/gpt/_journal-entries.ts',
  '/api/gpt/tasks':            '../api/gpt/_tasks.ts',
  '/api/gpt/meeting-notes':    '../api/gpt/_meeting-notes.ts',
  '/api/gpt/weekly-summary':   '../api/gpt/_weekly-summary.ts',
  '/api/gpt/projects':         '../api/gpt/_projects.ts',
  '/api/gpt/search':           '../api/gpt/_search.ts',
  '/api/gpt/reflections':      '../api/gpt/_reflections.ts',
}

/** Parse query string into an object (same shape as VercelRequest.query) */
function parseQuery(rawUrl: string): Record<string, string> {
  const parsed = new URL(rawUrl, 'http://localhost')
  const q: Record<string, string> = {}
  parsed.searchParams.forEach((v, k) => { q[k] = v })
  return q
}

/** Minimal shims so Vercel handler signatures work as-is */
function makeAdapter(
  nodeReq: IncomingMessage,
  nodeRes: ServerResponse,
  body: unknown,
  query: Record<string, string>,
) {
  const req = { method: nodeReq.method, body, query, headers: nodeReq.headers }

  const res = {
    _code: 200,
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this._headers[name] = value },
    status(code: number) { this._code = code; return this },
    end() {
      nodeRes.writeHead(this._code, {
        'Access-Control-Allow-Origin': '*',
        ...this._headers,
      })
      nodeRes.end()
    },
    json(data: unknown) {
      nodeRes.writeHead(this._code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...this._headers,
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    nodeRes.end()
    return
  }

  const rawUrl   = nodeReq.url ?? '/'
  const pathname = rawUrl.split('?')[0]
  const query    = parseQuery(rawUrl)
  const modulePath = ROUTES[pathname]

  if (!modulePath) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' })
    nodeRes.end(JSON.stringify({ error: `No dev handler for ${pathname}` }))
    return
  }

  // Parse body only for non-GET requests
  let body: unknown = {}
  if (nodeReq.method !== 'GET') {
    let raw = ''
    for await (const chunk of nodeReq) raw += chunk
    try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
  }

  const { req, res } = makeAdapter(nodeReq, nodeRes, body, query)

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
