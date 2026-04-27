import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../contexts/ToastContext'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [exporting, setExporting] = useState(false)
  const [signOutModal, setSignOutModal] = useState(false)

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

      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Export data</h2>
        <p className="text-xs text-gray-500 mb-4">
          Download all your journals, tasks, transcripts, projects, and tags as a JSON file.
        </p>
        <Button variant="secondary" onClick={exportData} loading={exporting}>
          {exporting ? 'Exporting...' : 'Export as JSON'}
        </Button>
      </Card>

      <Modal open={signOutModal} onClose={() => setSignOutModal(false)} title="Sign out?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">You'll be redirected to the login screen.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSignOutModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleSignOut}>Sign out</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
