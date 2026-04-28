import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Project } from '../types'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .is('archived_at', null)
      .order('name')
    setProjects(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (name: string, description?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, description: description ?? null, user_id: user!.id })
      .select()
      .single()
    if (!error) setProjects(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return { data, error }
  }

  const update = async (id: string, name: string, description?: string) => {
    const { data, error } = await supabase
      .from('projects')
      .update({ name, description: description ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (!error) setProjects(prev => prev.map(p => p.id === id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
    return { data, error }
  }

  /** Soft-delete: sets archived_at instead of deleting the row */
  const remove = async (id: string) => {
    const { error } = await supabase
      .from('projects')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setProjects(prev => prev.filter(p => p.id !== id))
    return { error }
  }

  return { projects, loading, refetch: fetch, create, update, remove }
}
