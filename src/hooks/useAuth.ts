import { useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const IS_PREVIEW = import.meta.env.VITE_SUPABASE_URL?.includes('placeholder')

const FAKE_USER = IS_PREVIEW ? {
  id: 'preview-user-id',
  email: 'preview@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User : null

const FAKE_SESSION = IS_PREVIEW ? { user: FAKE_USER } as unknown as Session : null

export function useAuth() {
  const [session, setSession] = useState<Session | null>(FAKE_SESSION)
  const [user, setUser] = useState<User | null>(FAKE_USER)
  const [loading, setLoading] = useState(!IS_PREVIEW)

  useEffect(() => {
    if (IS_PREVIEW) return
    const timeout = setTimeout(() => setLoading(false), 3000)
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signOut = async () => {
    return supabase.auth.signOut()
  }

  return { session, user, loading, signIn, signOut }
}
