import { useEffect, useState } from 'react'
import { TaskForm } from './TaskForm'
import { MeetingForm } from './MeetingForm'
import { SettingsView } from './SettingsView'
import type { PageContext, Settings, Metadata } from './types'

type Tab = 'task' | 'meeting'
type View = 'capture' | 'settings' | 'success'

export function App() {
  const [view, setView] = useState<View>('capture')
  const [tab, setTab] = useState<Tab>('task')
  const [pageCtx, setPageCtx] = useState<PageContext>({ url: '', title: '' })
  const [settings, setSettings] = useState<Settings>({ token: '', appUrl: '' })
  const [metadata, setMetadata] = useState<Metadata>({ projects: [], tags: [], attendees: [] })
  const [metaLoading, setMetaLoading] = useState(false)
  const [successType, setSuccessType] = useState<string>('')
  const [successId, setSuccessId] = useState<string>('')
  const [pendingText, setPendingText] = useState<string>('')

  // Load saved settings + page context on mount
  useEffect(() => {
    // Connect so background can detect popup open (to clear badge)
    chrome.runtime.connect({ name: 'popup' })

    chrome.storage.sync.get(['token', 'appUrl'], (result) => {
      setSettings({
        token: result.token ?? '',
        appUrl: result.appUrl ?? '',
      })
    })

    // Get current tab URL + title
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab) {
        setPageCtx({ url: tab.url ?? '', title: tab.title ?? '' })
      }
    })

    // Check for pending capture from context menu
    chrome.storage.local.get(['pendingCapture'], (result) => {
      const pending = result.pendingCapture
      if (pending && Date.now() - pending.timestamp < 30_000) {
        setPendingText(pending.selectedText ?? '')
        chrome.storage.local.remove('pendingCapture')
      }
    })
  }, [])

  // Load metadata once we have a token + appUrl
  useEffect(() => {
    if (!settings.token || !settings.appUrl) return
    setMetaLoading(true)
    fetch(`${settings.appUrl.replace(/\/$/, '')}/api/extension/metadata`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.projects || d.tags || d.attendees) {
          setMetadata({
            projects: d.projects ?? [],
            tags: d.tags ?? [],
            attendees: d.attendees ?? [],
          })
        }
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false))
  }, [settings.token, settings.appUrl])

  const saveSettings = (next: Settings) => {
    setSettings(next)
    chrome.storage.sync.set({ token: next.token, appUrl: next.appUrl })
    setView('capture')
  }

  const handleSuccess = (type: string, id: string) => {
    setSuccessType(type)
    setSuccessId(id)
    setView('success')
  }

  const openInApp = () => {
    const base = settings.appUrl.replace(/\/$/, '')
    const path = successType === 'task' ? '/tasks' : `/transcripts/${successId}`
    chrome.tabs.create({ url: `${base}${path}` })
  }

  const isConfigured = settings.token && settings.appUrl

  if (view === 'settings') {
    return (
      <SettingsView
        settings={settings}
        onSave={saveSettings}
        onCancel={() => setView('capture')}
      />
    )
  }

  if (view === 'success') {
    return (
      <div className="p-5 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {successType === 'task' ? 'Task saved!' : 'Meeting note saved!'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Added to your Workday Journal</p>
        </div>
        <div className="flex gap-2 w-full">
          <button
            onClick={openInApp}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
          >
            Open in app ↗
          </button>
          <button
            onClick={() => { setView('capture'); setSuccessId(''); setSuccessType('') }}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            Capture another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Workday Journal</span>
        </div>
        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {!isConfigured && (
        <div className="mx-4 mt-3 mb-1 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">Setup required</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Click the gear icon to add your API token and app URL.
          </p>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex px-4 pt-3 gap-1">
        <button
          onClick={() => setTab('task')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            tab === 'task'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Task
        </button>
        <button
          onClick={() => setTab('meeting')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            tab === 'meeting'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Meeting Note
        </button>
      </div>

      {/* Form area */}
      <div className="px-4 pt-3 pb-4">
        {tab === 'task' ? (
          <TaskForm
            pageCtx={pageCtx}
            settings={settings}
            metadata={metadata}
            metaLoading={metaLoading}
            pendingText={pendingText}
            onSuccess={handleSuccess}
          />
        ) : (
          <MeetingForm
            pageCtx={pageCtx}
            settings={settings}
            metadata={metadata}
            metaLoading={metaLoading}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </div>
  )
}
