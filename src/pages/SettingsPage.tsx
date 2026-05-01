import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiCheckLine, RiCloseLine, RiPencilLine, RiPlugLine, RiShieldCheckLine, RiShieldLine, RiUserLine } from '@remixicon/react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useAttendees } from '../hooks/useAttendees'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { MfaSetupModal } from '../components/ui/MfaSetupModal'
import { useToast } from '../contexts/ToastContext'

interface ApiToken {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { attendees, loading: attendeesLoading, rename: renameAttendee, remove: removeAttendee } = useAttendees()

  // Inline rename state
  const [editingAttendeeId, setEditingAttendeeId] = useState<string | null>(null)
  const [editingAttendeeName, setEditingAttendeeName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = (id: string, currentName: string) => {
    setEditingAttendeeId(id)
    setEditingAttendeeName(currentName)
    setTimeout(() => renameInputRef.current?.focus(), 30)
  }

  const commitRename = async () => {
    if (!editingAttendeeId || !editingAttendeeName.trim()) { setEditingAttendeeId(null); return }
    await renameAttendee(editingAttendeeId, editingAttendeeName)
    setEditingAttendeeId(null)
  }
  const [exporting, setExporting] = useState(false)
  const [signOutModal, setSignOutModal] = useState(false)

  // Extension API tokens
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null)
  const [revokeModal, setRevokeModal] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)

  const loadApiTokens = async () => {
    setTokensLoading(true)
    const { data } = await supabase
      .from('api_tokens')
      .select('id, name, created_at, last_used_at')
      .order('created_at', { ascending: false })
    setApiTokens(data ?? [])
    setTokensLoading(false)
  }

  const generateToken = async () => {
    setGeneratingToken(true)
    const { data: { user } } = await supabase.auth.getUser()
    const token = 'wj_' + crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('api_tokens').insert({
      user_id: user!.id,
      token,
      name: 'Extension Token',
    })
    if (error) {
      addToast('Failed to generate token', 'error')
    } else {
      setNewTokenValue(token)
      await loadApiTokens()
    }
    setGeneratingToken(false)
  }

  const revokeToken = async () => {
    if (!revokeModal) return
    setRevoking(true)
    const { error } = await supabase.from('api_tokens').delete().eq('id', revokeModal)
    if (error) {
      addToast('Failed to revoke token', 'error')
    } else {
      addToast('Token revoked', 'info')
      setApiTokens(prev => prev.filter(t => t.id !== revokeModal))
    }
    setRevoking(false)
    setRevokeModal(null)
  }

  useEffect(() => { loadApiTokens() }, [])

  // MFA state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaLoading, setMfaLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableModal, setDisableModal] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const loadMfaStatus = async () => {
    setMfaLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    const verified = data?.totp?.find(f => f.status === 'verified')
    setMfaFactorId(verified?.id ?? null)
    setMfaLoading(false)
  }

  useEffect(() => { loadMfaStatus() }, [])

  const handleDisable = async () => {
    if (!mfaFactorId) return
    setDisabling(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId })
    if (error) {
      addToast('Failed to disable 2FA', 'error')
    } else {
      setMfaFactorId(null)
      addToast('Two-factor authentication disabled', 'info')
    }
    setDisabling(false)
    setDisableModal(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const exportData = async () => {
    setExporting(true)
    const [
      { data: journals },
      { data: tasks },
      { data: transcripts },
      { data: projects },
      { data: tags },
    ] = await Promise.all([
      supabase.from('journal_entries').select('*').order('entry_date'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('transcripts').select('*').order('created_at'),
      supabase.from('projects').select('*').order('name'),
      supabase.from('tags').select('*').order('name'),
    ])

    const exportObj = {
      exported_at: new Date().toISOString(),
      user_email: user?.email,
      journal_entries: journals ?? [],
      tasks: tasks ?? [],
      transcripts: transcripts ?? [],
      projects: projects ?? [],
      tags: tags ?? [],
    }

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workday-journal-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
    addToast('Export complete', 'success')
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Account and preferences</p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Account</h2>
        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</span>
            <p className="text-sm text-gray-900 mt-0.5">{user?.email}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">User ID</span>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{user?.id}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Button variant="danger" size="sm" onClick={() => setSignOutModal(true)}>Sign out</Button>
        </div>
      </Card>

      {/* 2FA Card */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            {mfaLoading ? (
              <div className="w-4 h-4 mt-0.5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : mfaFactorId ? (
              <RiShieldCheckLine size={18} className="text-green-500 mt-0.5 shrink-0" />
            ) : (
              <RiShieldLine size={18} className="text-gray-400 mt-0.5 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Two-factor authentication</h2>
              {mfaLoading ? (
                <p className="text-xs text-gray-400 mt-0.5">Checking status…</p>
              ) : mfaFactorId ? (
                <p className="text-xs text-green-600 mt-0.5 font-medium">Enabled — your account is protected by TOTP</p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">
                  Add a second layer of security. You'll need your authenticator app each time you sign in.
                </p>
              )}
            </div>
          </div>
          {!mfaLoading && (
            mfaFactorId ? (
              <Button variant="secondary" size="sm" onClick={() => setDisableModal(true)}>
                Disable
              </Button>
            ) : (
              <Button size="sm" onClick={() => setSetupOpen(true)}>
                Enable
              </Button>
            )
          )}
        </div>
      </Card>

      {/* Attendees management */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <RiUserLine size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Known attendees</h2>
        </div>
        {attendeesLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : attendees.length === 0 ? (
          <p className="text-xs text-gray-400">No attendees saved yet. They'll appear here after you save a meeting note with attendees filled in.</p>
        ) : (
          <ul className="space-y-1">
            {attendees.map(a => (
              <li key={a.id} className="flex items-center gap-2 group/att py-0.5">
                {editingAttendeeId === a.id ? (
                  <>
                    <input
                      ref={renameInputRef}
                      value={editingAttendeeName}
                      onChange={e => setEditingAttendeeName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingAttendeeId(null)
                      }}
                      className="flex-1 text-sm px-2 py-0.5 rounded border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button onClick={commitRename} className="p-1 text-green-500 hover:text-green-700 transition rounded" title="Save">
                      <RiCheckLine size={14} />
                    </button>
                    <button onClick={() => setEditingAttendeeId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition rounded" title="Cancel">
                      <RiCloseLine size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700">{a.name}</span>
                    <button
                      onClick={() => startRename(a.id, a.name)}
                      className="opacity-0 group-hover/att:opacity-100 transition-opacity p-1 text-gray-400 hover:text-indigo-600 rounded"
                      title="Rename"
                    >
                      <RiPencilLine size={13} />
                    </button>
                    <button
                      onClick={() => removeAttendee(a.id)}
                      className="opacity-0 group-hover/att:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Remove"
                    >
                      <RiCloseLine size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400 mt-3">Renaming or removing here only affects suggestions — existing meeting notes are not changed.</p>
      </Card>

      {/* Extension API Token card */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <RiPlugLine size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Extension API Token</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Generate a token to connect the Workday Journal Chrome extension. Paste it into the extension's settings.
        </p>

        {tokensLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : apiTokens.length === 0 ? (
          <p className="text-xs text-gray-400 mb-3">No tokens yet.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {apiTokens.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    Created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at && ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => setRevokeModal(t.id)}
                  className="text-xs text-red-500 hover:text-red-700 shrink-0 transition"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        {newTokenValue && (
          <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
            <p className="text-xs font-medium text-indigo-700">Token generated — copy it now, it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-indigo-900 bg-white border border-indigo-200 rounded px-2 py-1.5 truncate">
                {newTokenValue}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(newTokenValue); addToast('Copied!', 'success') }}
                className="text-xs px-2.5 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition shrink-0"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setNewTokenValue(null)}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              Done, I've saved it
            </button>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={generateToken}
          loading={generatingToken}
          disabled={apiTokens.length >= 5}
        >
          Generate token
        </Button>
        {apiTokens.length >= 5 && (
          <p className="text-xs text-gray-400 mt-1.5">Revoke an existing token to generate a new one.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Export data</h2>
        <p className="text-xs text-gray-500 mb-4">
          Download all your journals, tasks, transcripts, projects, and tags as a JSON file.
        </p>
        <Button variant="secondary" onClick={exportData} loading={exporting}>
          {exporting ? 'Exporting...' : 'Export as JSON'}
        </Button>
      </Card>

      {/* 2FA Setup Modal */}
      <MfaSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onEnrolled={() => { loadMfaStatus(); addToast('Two-factor authentication enabled', 'success') }}
      />

      {/* Disable 2FA confirmation */}
      <Modal open={disableModal} onClose={() => setDisableModal(false)} title="Disable two-factor authentication?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Removing 2FA means you'll only need your password to sign in. You can re-enable it any time from Settings.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDisableModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDisable} loading={disabling}>Disable 2FA</Button>
          </div>
        </div>
      </Modal>

      {/* Sign out confirmation */}
      <Modal open={signOutModal} onClose={() => setSignOutModal(false)} title="Sign out?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">You'll be redirected to the login screen.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSignOutModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleSignOut}>Sign out</Button>
          </div>
        </div>
      </Modal>

      {/* Revoke token confirmation */}
      <Modal open={revokeModal !== null} onClose={() => setRevokeModal(null)} title="Revoke token?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            The extension will stop working immediately. You can generate a new token at any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevokeModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={revokeToken} loading={revoking}>Revoke</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
