import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Person, RelationshipType } from '../types'

export interface NewPersonInput {
  name: string
  relationship_type: RelationshipType
  role?: string
  organization?: string
  where_met?: string
  avatar_url?: string
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('people')
      .select('*')
      .is('archived_at', null)
      .order('name')
    setPeople(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (input: NewPersonInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('people')
      .insert({
        user_id: user!.id,
        name: input.name.trim(),
        relationship_type: input.relationship_type,
        role: input.role || null,
        organization: input.organization || null,
        where_met: input.where_met || null,
        avatar_url: input.avatar_url || null,
      })
      .select()
      .single()
    if (!error) setPeople(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return { data, error }
  }

  const update = async (id: string, patch: Partial<NewPersonInput> & { snapshot?: Record<string, string[]> }) => {
    const { data, error } = await supabase
      .from('people')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (!error) setPeople(prev => prev.map(p => p.id === id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
    return { data, error }
  }

  const markViewed = async (id: string) => {
    await supabase.from('people').update({ last_viewed_at: new Date().toISOString() }).eq('id', id)
  }

  /** Soft-delete: sets archived_at instead of deleting the row */
  const remove = async (id: string) => {
    const { error } = await supabase
      .from('people')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setPeople(prev => prev.filter(p => p.id !== id))
    return { error }
  }

  /** Find a person by exact name match (case-insensitive) — used for mention matching */
  const findByName = (name: string): Person | undefined => {
    const target = name.trim().toLowerCase()
    return people.find(p => p.name.trim().toLowerCase() === target)
  }

  return { people, loading, refetch: fetch, create, update, remove, markViewed, findByName }
}
