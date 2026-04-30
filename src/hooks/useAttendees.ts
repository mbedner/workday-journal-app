import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Attendee {
  id: string
  name: string
}

export function useAttendees() {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attendees')
      .select('id, name')
      .order('name')
    setAttendees(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  /** Ensure all names exist in the attendees table (upsert by name). */
  const syncNames = async (names: string[]) => {
    if (!names.length) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('attendees').upsert(
      names.map(name => ({ user_id: user!.id, name })),
      { onConflict: 'user_id,name', ignoreDuplicates: true }
    )
    // Refresh so new names show up immediately
    fetch()
  }

  const rename = async (id: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const { data } = await supabase
      .from('attendees')
      .update({ name: trimmed })
      .eq('id', id)
      .select('id, name')
      .single()
    if (data) setAttendees(prev => prev.map(a => a.id === id ? data : a).sort((a, b) => a.name.localeCompare(b.name)))
  }

  const remove = async (id: string) => {
    await supabase.from('attendees').delete().eq('id', id)
    setAttendees(prev => prev.filter(a => a.id !== id))
  }

  return {
    attendees,
    names: attendees.map(a => a.name),
    loading,
    syncNames,
    rename,
    remove,
  }
}
