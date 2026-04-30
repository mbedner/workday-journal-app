import { useEffect, useRef, useState } from 'react'
import { RiCheckLine, RiFileCopyLine, RiShieldCheckLine } from '@remixicon/react'
import { supabase } from '../../lib/supabase'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'

interface Props {
  open: boolean
  onClose: () => void
  onEnrolled: () => void
}

type Step = 'loading' | 'qr' | 'verifying' | 'done' | 'error'

export function MfaSetupModal({ open, onClose, onEnrolled }: Props) {
  const [step, setStep] = useState<Step>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')   // SVG data URI
  const [secret, setSecret] = useState('')   // manual entry fallback
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStep('loading')
    setCode('')
    setCodeError('')
    setCopied(false)

    supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Workday Journal' }).then(({ data, error }) => {
      if (error || !data) {
        setStep('error')
        return
      }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)   // SVG data URI
      setSecret(data.totp.secret)
      setStep('qr')
      setTimeout(() => codeRef.current?.focus(), 100)
    })
  }, [open])

  const handleVerify = async () => {
    if (code.length < 6) return
    setCodeError('')
    setSubmitting(true)

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challengeData) {
      setCodeError('Failed to start verification. Please try again.')
      setSubmitting(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    })

    if (verifyError) {
      setCodeError('Incorrect code — check your app and try again.')
      setCode('')
      setSubmitting(false)
      codeRef.current?.focus()
    } else {
      setStep('done')
      setSubmitting(false)
    }
  }

  const handleDone = () => {
    onEnrolled()
    onClose()
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = async () => {
    // If the user closes mid-setup (before verifying), unenroll the pending factor
    if (step === 'qr' && factorId) {
      await supabase.auth.mfa.unenroll({ factorId })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Set up two-factor authentication" size="sm">
      {step === 'loading' && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            Could not start 2FA enrollment. Make sure MFA is enabled in your Supabase project under{' '}
            <strong>Authentication → Sign In / MFA</strong>, then try again.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      {step === 'qr' && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Scan the QR code below with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.
          </p>

          {/* QR code */}
          <div className="flex justify-center">
            <div className="bg-white border border-gray-200 rounded-xl p-3 inline-block">
              <img src={qrCode} alt="2FA QR code" className="w-44 h-44" />
            </div>
          </div>

          {/* Manual secret fallback */}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700 transition select-none">
              Can't scan? Enter the key manually
            </summary>
            <div className="mt-2 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <code className="flex-1 font-mono text-gray-700 break-all text-xs">{secret}</code>
              <button
                type="button"
                onClick={copySecret}
                className="shrink-0 p-1 text-gray-400 hover:text-indigo-600 transition rounded"
                title="Copy key"
              >
                {copied ? <RiCheckLine size={14} className="text-green-500" /> : <RiFileCopyLine size={14} />}
              </button>
            </div>
          </details>

          {/* Code entry */}
          <div className="space-y-3">
            <Input
              ref={codeRef}
              label="Authentication code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="tracking-widest text-center text-lg font-mono"
              maxLength={6}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
            />
            {codeError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{codeError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleVerify} loading={submitting} disabled={code.length < 6}>
              Enable 2FA
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <RiShieldCheckLine size={24} className="text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Two-factor authentication enabled</p>
              <p className="text-xs text-gray-500 mt-1">
                You'll be asked for a code from your authenticator app each time you sign in.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDone}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
