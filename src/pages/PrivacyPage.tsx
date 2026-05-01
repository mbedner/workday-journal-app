export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">Workday Journal</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Overview</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Workday Journal is a personal productivity app and Chrome extension. This policy explains what data is
              collected, how it is stored, and how it is used. In short: your data stays yours, is never sold,
              and is never shared with third parties.
            </p>
          </section>

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Data collected by the web app</h2>
            <ul className="text-sm text-gray-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li>Your email address, used for account authentication</li>
              <li>Journal entries, tasks, meeting notes, projects, and tags you create</li>
              <li>Productivity ratings and other content you explicitly enter</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              All data is stored in your own Supabase database and is protected by row-level security policies,
              meaning only your authenticated account can read or write your data.
            </p>
          </section>

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Data collected by the Chrome extension</h2>
            <ul className="text-sm text-gray-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li>
                <strong>API token and app URL</strong> — stored locally in Chrome's sync storage so the extension
                can authenticate with your app. Never transmitted to any third party.
              </li>
              <li>
                <strong>Selected text</strong> — if you highlight text on a page before opening the extension,
                that text is temporarily held in local browser storage to pre-fill the task title. It is cleared
                immediately after the popup reads it.
              </li>
              <li>
                <strong>Current page URL and title</strong> — read from the active browser tab when you open
                the popup, and optionally attached to a task or meeting note as a source reference. Only sent
                to your own app when you choose to save a capture.
              </li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              The extension does not track your browsing history, collect analytics, or transmit any data to
              anyone other than your own Workday Journal app.
            </p>
          </section>

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Third-party services</h2>
            <ul className="text-sm text-gray-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li>
                <strong>Supabase</strong> — used for database storage and authentication.
                Data is stored in a project you control.
              </li>
              <li>
                <strong>Vercel</strong> — used to host the web application and serverless API functions.
              </li>
              <li>
                <strong>Google Gemini API</strong> — optionally used for AI writing assistance features
                (clean up writing, meeting summaries). Only the specific text you request to improve is sent;
                no other personal data is included.
              </li>
            </ul>
          </section>

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Data retention and deletion</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your data is retained for as long as your account exists. You can export all your data at any
              time from the Settings page. Deleting your account removes all associated data from the database.
            </p>
          </section>

          <section className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Changes to this policy</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              If this policy changes materially, the "last updated" date above will be updated. Continued use
              of the app or extension constitutes acceptance of the updated policy.
            </p>
          </section>

        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          Workday Journal · Personal productivity tool
        </p>
      </div>
    </div>
  )
}
