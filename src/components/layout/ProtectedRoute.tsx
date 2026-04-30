import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { RiLoaderLine } from '@remixicon/react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const IS_PREVIEW = import.meta.env.VITE_SUPABASE_URL?.includes('placeholder')

type MfaStatus = 'checking' | 'ok' | 'needed'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('checking')

  useEffect(() => {
    if (!session) {
      setMfaStatus('checking') // will redirect to /login anyway
      return
    }
    if (IS_PREVIEW) {
      setMfaStatus('ok')
      return
    }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        setMfaStatus('needed')
      } else {
        setMfaStatus('ok')
      }
    })
  }, [session])

  if (loading || (session && mfaStatus === 'checking')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RiLoaderLine size={32} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (mfaStatus === 'needed') return <Navigate to="/mfa" replace />

  return <Outlet />
}
