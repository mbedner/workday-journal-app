/**
 * Single catch-all Vercel serverless function for all GPT connector endpoints.
 * Routes /api/gpt/* to the appropriate handler based on the first path segment.
 *
 * Uses a catch-all to stay within Vercel Hobby plan's 12-function limit.
 * Handler files are prefixed with _ so Vercel doesn't count them as routes.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { err, setCors } from './_db'
import healthHandler from './_health'
import journalEntriesHandler from './_journal-entries'
import tasksHandler from './_tasks'
import meetingNotesHandler from './_meeting-notes'
import weeklySummaryHandler from './_weekly-summary'
import projectsHandler from './_projects'
import searchHandler from './_search'
import reflectionsHandler from './_reflections'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

const ROUTES: Record<string, Handler> = {
  'health':          healthHandler,
  'journal-entries': journalEntriesHandler,
  'tasks':           tasksHandler,
  'meeting-notes':   meetingNotesHandler,
  'weekly-summary':  weeklySummaryHandler,
  'projects':        projectsHandler,
  'search':          searchHandler,
  'reflections':     reflectionsHandler,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the first path segment from the catch-all parameter
  // For /api/gpt/health, req.query.path = ['health']
  const pathParam = req.query.path
  const segment   = Array.isArray(pathParam) ? pathParam[0] : (pathParam ?? '')

  const routeHandler = ROUTES[segment]

  if (!routeHandler) {
    setCors(res)
    return res.status(404).json(
      err('NOT_FOUND', `Unknown route: /api/gpt/${segment}. Available: ${Object.keys(ROUTES).join(', ')}`)
    )
  }

  return routeHandler(req, res)
}
