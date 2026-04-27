/** Base shimmer block — combine to build page-specific skeletons */
export function Sk({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-200 rounded-md animate-pulse ${className}`} />
  )
}

/** A white card container with divide-y rows — used by list skeletons */
export function SkListCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <Sk className="h-3.5 w-48" />
            <Sk className="h-2.5 w-72 max-w-full" />
          </div>
          <Sk className="h-4 w-4 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Stat card row — used by dashboard + project detail */
export function SkStatRow({ cols = 6 }: { cols?: number }) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-2">
          <Sk className="h-2.5 w-16" />
          <Sk className="h-7 w-10" />
          <Sk className="h-2 w-12" />
        </div>
      ))}
    </div>
  )
}

/** Detail page header skeleton */
export function SkDetailHeader() {
  return (
    <div className="space-y-2">
      <Sk className="h-2.5 w-24" />
      <Sk className="h-8 w-64" />
      <Sk className="h-3 w-40" />
    </div>
  )
}
