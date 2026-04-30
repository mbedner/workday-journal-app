import { FormEvent, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { RiArrowLeftLine, RiShieldKeyholeLine } from '@remixicon/react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

type Step = 'credentials' | 'mfa'

export function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // MFA step
  const [totpCode, setTotpCode] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Only redirect returning users who already have a complete session.
  // Don't fire during an active submission (session lands before AAL check finishes)
  // and don't fire once we've moved to the MFA step.
  if (!loading && session && !submitting && step === 'credentials') return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
      return
    }

    // Check whether MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const factorId = factorsData?.totp?.[0]?.id ?? ''
      setMfaFactorId(factorId)
      setStep('mfa')
      setSubmitting(false)
      setTimeout(() => codeInputRef.current?.focus(), 50)
    } else {
      navigate('/dashboard')
    }
  }

  const handleMfaVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (totpCode.replace(/\s/g, '').length < 6) return
    setMfaError('')
    setMfaVerifying(true)

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: totpCode.replace(/\s/g, ''),
    })

    if (verifyError) {
      setMfaError('Incorrect code. Check your authenticator app and try again.')
      setTotpCode('')
      setMfaVerifying(false)
      codeInputRef.current?.focus()
    } else {
      navigate('/dashboard')
    }
  }

  const handleCodeInput = (val: string) => {
    // Allow digits and spaces only; cap at 6 digits
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setTotpCode(digits)
  }

  if (step === 'mfa') {
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
              <h2 className="text-base font-semibold text-gray-900">Two-factor authentication</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Open your authenticator app and enter the 6-digit code for Workday Journal.
            </p>
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <Input
                ref={codeInputRef}
                label="Authentication code"
                value={totpCode}
                onChange={e => handleCodeInput(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="tracking-widest text-center text-lg font-mono"
                maxLength={6}
                required
              />
              {mfaError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{mfaError}</p>}
              <Button type="submit" loading={mfaVerifying} className="w-full" disabled={totpCode.length < 6}>
                Verify
              </Button>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setMfaError('') }}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition mx-auto"
              >
                <RiArrowLeftLine size={14} /> Back to sign in
              </button>
            </form>
          </div>
        </div>
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
          <h2 className="text-base font-semibold text-gray-900 mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" loading={submitting} className="w-full">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
