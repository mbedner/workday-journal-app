import type { Settings } from './types'

export async function capture(
  settings: Settings,
  type: 'task' | 'meeting_note',
  data: Record<string, any>
): Promise<{ id: string }> {
  const base = settings.appUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/api/extension/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({ type, data }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`)
  }
  return json
}
