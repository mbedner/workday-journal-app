import { useState } from 'react'
import type { Settings } from './types'

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onCancel: () => void
}

export function SettingsView({ settings, onSave, onCancel }: Props) {
  const [token, setToken] = useState(settings.token)
  const [appUrl, setAppUrl] = useState(settings.appUrl)
  const [showToken, setShowToken] = useState(false)

  const handleSave = () => {
    onSave({
      token: token.trim(),
      appUrl: appUrl.trim().replace(/\/$/, ''),
    })
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="p-1 -ml-1 rounded text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900">Extension Settings</span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-5 space-y-4">
        <div className="p-3 bg-indigo-50 rounded-xl text-xs text-indigo-700 leading-relaxed">
          Generate an API token in your Workday Journal app under <strong>Settings → Extension API Token</strong>, then paste it here.
        </div>

        {/* App URL */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">App URL</label>
          <input
            value={appUrl}
            onChange={e => setAppUrl(e.target.value)}
            placeholder="https://your-app.vercel.app"
            type="url"
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-gray-400 mt-1">The URL where your Workday Journal is deployed.</p>
        </div>

        {/* API Token */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">API Token</label>
          <div className="relative">
            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="wj_..."
              type={showToken ? 'text' : 'password'}
              className="w-full text-sm px-3 py-2 pr-10 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Stored securely in your browser's sync storage.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={!token.trim() || !appUrl.trim()}
          className="w-full py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}
