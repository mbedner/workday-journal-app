import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiShieldKeyholeLine } from '@remixicon/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function MfaVerifyPage() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  const [factorId, setFactorId] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [loadingFactor, setLoadingFactor] = useState(true)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!session) { navigate('/login', { replace: true }); return }
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const id = data?.totp?.[0]?.id ?? null
      setFactorId(id)
      setLoadingFactor(false)
      if (id) setTimeout(() => codeInputRef.current?.focus(), 50)
    })
  }, [session])

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (!factorId || totpCode.length < 6) return
    setError('')
    setVerifying(true)

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: totpCode,
    })

    if (verifyError) {
      setError('Incorrect code. Check your authenticator app and try again.')
      setTotpCode('')
      setVerifying(false)
      codeInputRef.current?.focus()
    } else {
      navigate('/dashboard', { replace: true })
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loadingFactor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Workday Journal</h1>
          <p className="text-sm text-gray-500 mt-1">Your daily work companion</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-2 mb-1">
            <RiShieldKeyholeLine size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Verify your identity</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Your session requires two-factor authentication. Enter the code from your authenticator app to continue.
          </p>
          <form onSubmit={handleVerify} className="space-y-4">
            <Input
              ref={codeInputRef}
              label="Authentication code"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="tracking-widest text-center text-lg font-mono"
              maxLength={6}
              required
            />
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" loading={verifying} className="w-full" disabled={totpCode.length < 6}>
              Continue
            </Button>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-gray-600 transition block mx-auto"
            >
              Sign out and use a different account
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
