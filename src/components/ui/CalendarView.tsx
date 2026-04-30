import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Link } from 'react-router-dom'

export interface CalendarItem {
  id: string
  date: string        // yyyy-MM-dd
  label: string
  url?: string
  onClick?: () => void
  color?: 'indigo' | 'green' | 'red' | 'yellow' | 'gray'
}

interface CalendarViewProps {
  items: CalendarItem[]
  initialMonth?: Date
}

const colorClass: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
  green:  'bg-green-100  text-green-700  hover:bg-green-200',
  red:    'bg-red-100    text-red-700    hover:bg-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
  gray:   'bg-gray-100   text-gray-600   hover:bg-gray-200',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 3

export function CalendarView({ items, initialMonth }: CalendarViewProps) {
  const [month, setMonth] = useState(initialMonth ?? new Date())

  const monthStart = startOfMonth(month)
  const monthEnd   = endOfMonth(month)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd     = endOfWeek(monthEnd,     { weekStartsOn: 0 })

  const days: Date[] = []
  let cursor = calStart
  while (cursor <= calEnd) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }

  // Build date-string → items lookup
  const byDate: Record<string, CalendarItem[]> = {}
  for (const item of items) {
    if (!item.date) continue
    if (!byDate[item.date]) byDate[item.date] = []
    byDate[item.date].push(item)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded hover:bg-gray-100 transition text-gray-500"
        >
          <RiArrowLeftSLine size={16} />
        </button>
        <p className="text-sm font-semibold text-gray-900">{format(month, 'MMMM yyyy')}</p>
        <button
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-1.5 rounded hover:bg-gray-100 transition text-gray-500"
        >
          <RiArrowRightSLine size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateStr    = format(day, 'yyyy-MM-dd')
          const dayItems   = byDate[dateStr] ?? []
          const visible    = dayItems.slice(0, MAX_VISIBLE)
          const extraCount = dayItems.length - visible.length
          const inMonth    = isSameMonth(day, month)
          const today      = isToday(day)

          return (
            <div
              key={i}
              className={[
                'min-h-[90px] p-1.5',
                i >= 7 ? 'border-t border-gray-100' : '',
                i % 7 !== 6 ? 'border-r border-gray-100' : '',
                !inMonth ? 'bg-gray-50/40' : '',
              ].join(' ')}
            >
              {/* Day number */}
              <div className={[
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                today   ? 'bg-indigo-600 text-white' :
                inMonth ? 'text-gray-700' : 'text-gray-300',
              ].join(' ')}>
                {format(day, 'd')}
              </div>

              {/* Items */}
              <div className="space-y-0.5">
                {visible.map(item => {
                  const cls = `block w-full text-left text-xs px-1.5 py-0.5 rounded truncate transition-colors ${colorClass[item.color ?? 'indigo']}`
                  return item.url ? (
                    <Link key={item.id} to={item.url} className={cls}>{item.label}</Link>
                  ) : (
                    <button key={item.id} onClick={item.onClick} className={cls}>{item.label}</button>
                  )
                })}
                {extraCount > 0 && (
                  <span className="text-xs text-gray-400 pl-1">+{extraCount} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
