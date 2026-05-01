interface Props {
  url: string
  title: string
}

function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export function SourcePreview({ url, title }: Props) {
  if (!url) return null
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{hostname(url)}</p>
        {title && <p className="text-xs text-gray-700 truncate">{title}</p>}
      </div>
    </div>
  )
}
