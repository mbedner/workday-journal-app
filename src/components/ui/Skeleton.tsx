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
          <div className="flex-1 min-w-0 space-y-2">
            <Sk className="h-3.5 w-48 max-w-full" />
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

// Sparse item pattern: [col, widthClass] pairs that should show an item pill
const ITEM_CELLS: Record<number, string[]> = {
  2: ['w-full'],
  4: ['w-5/6'],
  8: ['w-full', 'w-2/3'],
  11: ['w-3/4'],
  15: ['w-full'],
  17: ['w-4/5'],
  20: ['w-full', 'w-3/5'],
  23: ['w-2/3'],
  27: ['w-full'],
  30: ['w-5/6'],
}

/** Full calendar block skeleton — mirrors CalendarView layout */
export function SkCalendar() {
  const DAY_COLS = 7
  const WEEKS = 5

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <Sk className="h-6 w-6 rounded" />
        <Sk className="h-3.5 w-28" />
        <Sk className="h-6 w-6 rounded" />
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
        {Array.from({ length: DAY_COLS }).map((_, i) => (
          <div key={i} className="py-2 flex justify-center">
            <Sk className="h-2 w-5" />
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {Array.from({ length: WEEKS * DAY_COLS }).map((_, idx) => {
          const itemWidths = ITEM_CELLS[idx] ?? []
          const isFirstRow = idx < DAY_COLS
          const isLastCol  = idx % DAY_COLS === DAY_COLS - 1
          return (
            <div
              key={idx}
              className={[
                'min-h-[110px] p-2',
                !isFirstRow ? 'border-t border-gray-100' : '',
                !isLastCol  ? 'border-r border-gray-100' : '',
              ].join(' ')}
            >
              <Sk className="h-5 w-5 rounded-full mb-1.5" />
              <div className="space-y-1">
                {itemWidths.map((w, i) => (
                  <Sk key={i} className={`h-4 ${w} rounded`} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Responsive grid of card skeletons — mirrors list/grid view cards */
export function SkGridCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <Sk className="h-3.5 w-3/4" />
          <div className="space-y-1.5">
            <Sk className="h-2.5 w-full" />
            <Sk className="h-2.5 w-2/3" />
          </div>
          <div className="flex gap-1.5 pt-1">
            <Sk className="h-4 w-12 rounded-full" />
            <Sk className="h-4 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
