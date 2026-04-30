import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Returns a sorted, deduplicated list of every attendee name ever saved. */
export function useAttendees() {
  const [attendees, setAttendees] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('transcripts')
      .select('attendees')
      .is('archived_at', null)
      .not('attendees', 'is', null)
      .then(({ data }) => {
        const names = new Set<string>()
        for (const row of data ?? []) {
          if (row.attendees) {
            row.attendees
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
              .forEach((n: string) => names.add(n))
          }
        }
        setAttendees(Array.from(names).sort())
      })
  }, [])

  return attendees
}
