import { useEffect, useRef, useState } from 'react'
import { TaskForm, type TaskFormHandle } from './TaskForm'
import { MeetingForm, type MeetingFormHandle } from './MeetingForm'
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
  const [successType, setSuccessType] = useState('')
  const [successId, setSuccessId] = useState('')
  const [selectedText, setSelectedText] = useState('')

  // Shared save state lifted up for the fixed footer
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const taskRef = useRef<TaskFormHandle>(null)
  const meetingRef = useRef<MeetingFormHandle>(null)

  useEffect(() => {
    chrome.runtime.connect({ name: 'popup' })

    chrome.storage.sync.get(['token', 'appUrl'], (result) => {
      setSettings({ token: result.token ?? '', appUrl: result.appUrl ?? '' })
    })

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab) return
      setPageCtx({ url: tab.url ?? '', title: tab.title ?? '' })

      // Read selected text directly from the active tab
      if (tab.id != null) {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, func: () => window.getSelection()?.toString() ?? '' },
          (results) => {
            const sel = results?.[0]?.result?.trim() ?? ''
            if (sel) {
              setSelectedText(sel)
            } else {
              // Fall back to context-menu pending capture
              chrome.storage.local.get(['pendingCapture'], (r) => {
                const p = r.pendingCapture
                if (p && Date.now() - p.timestamp < 30_000) {
                  setSelectedText(p.selectedText ?? '')
                  chrome.storage.local.remove('pendingCapture')
                }
              })
            }
          }
        )
      }
    })
  }, [])

  useEffect(() => {
    if (!settings.token || !settings.appUrl) return
    setMetaLoading(true)
    fetch(`${settings.appUrl.replace(/\/$/, '')}/api/extension/metadata`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.projects || d.tags || d.attendees) {
          setMetadata({ projects: d.projects ?? [], tags: d.tags ?? [], attendees: d.attendees ?? [] })
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

  const handleSave = async () => {
    setError('')
    if (tab === 'task') await taskRef.current?.submit()
    else await meetingRef.current?.submit()
  }

  const openInApp = () => {
    const base = settings.appUrl.replace(/\/$/, '')
    chrome.tabs.create({ url: `${base}${successType === 'task' ? '/tasks' : `/transcripts/${successId}`}` })
  }

  const isConfigured = settings.token && settings.appUrl

  if (view === 'settings') {
    return (
      <SettingsView settings={settings} onSave={saveSettings} onCancel={() => setView('capture')} />
    )
  }

  if (view === 'success') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {successType === 'task' ? 'Task saved!' : 'Meeting note saved!'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Added to your Workday Journal</p>
        </div>
        <div className="flex gap-2 w-full">
          <button
            onClick={openInApp}
            className="flex-1 px-3 py-2.5 text-xs font-medium rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
          >
            Open in app ↗
          </button>
          <button
            onClick={() => { setView('capture'); setSuccessId(''); setSuccessType('') }}
            className="flex-1 px-3 py-2.5 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            Capture another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Fixed header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Workday Journal</span>
        </div>
        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="shrink-0 flex px-4 pt-3 pb-2 gap-1">
        {(['task', 'meeting'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError('') }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
              tab === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t === 'task' ? 'Task' : 'Meeting Note'}
          </button>
        ))}
      </div>

      {/* Setup warning */}
      {!isConfigured && (
        <div className="shrink-0 mx-4 mb-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
          <p className="text-xs font-medium text-amber-700">Setup required</p>
          <p className="text-xs text-amber-600 mt-0.5">Click ⚙ to add your API token and app URL.</p>
        </div>
      )}

      {/* Scrollable form body */}
      <div className="form-scroll flex-1 overflow-y-auto px-4 pb-2">
        {tab === 'task' ? (
          <TaskForm
            ref={taskRef}
            pageCtx={pageCtx}
            settings={settings}
            metadata={metadata}
            metaLoading={metaLoading}
            selectedText={selectedText}
            onSaving={setSaving}
            onError={setError}
            onSuccess={handleSuccess}
          />
        ) : (
          <MeetingForm
            ref={meetingRef}
            pageCtx={pageCtx}
            settings={settings}
            metadata={metadata}
            metaLoading={metaLoading}
            onSaving={setSaving}
            onError={setError}
            onSuccess={handleSuccess}
          />
        )}
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 px-4 pt-2 pb-4 border-t border-gray-100 bg-white space-y-2">
        {error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !isConfigured}
          className="w-full py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
        >
          {saving ? 'Saving…' : tab === 'task' ? 'Save Task' : 'Save Meeting Note'}
        </button>
      </div>
    </div>
  )
}
