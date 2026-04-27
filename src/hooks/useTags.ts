import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Tag } from '../types'

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('tags').select('*').order('name')
    setTags(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const findOrCreate = async (name: string): Promise<Tag | null> => {
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing

    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('tags')
      .insert({ name: name.trim(), user_id: user!.id })
      .select()
      .single()
    if (!error) {
      setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      return data
    }
    return null
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('tags').delete().eq('id', id)
    if (!error) setTags(prev => prev.filter(t => t.id !== id))
    return { error }
  }

  return { tags, loading, refetch: fetch, findOrCreate, remove }
}
