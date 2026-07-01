import { Link } from 'react-router-dom'
import { RiUserLine } from '@remixicon/react'
import { initials } from './Avatar'

export interface OrgNode {
  id: string
  name: string
  role?: string | null
}

interface Props {
  current: OrgNode
  manager?: OrgNode
  reports: OrgNode[]
}

const CARD_W = 192 // w-48
const GAP     = 16  // gap-4

function PersonCard({ node, current = false }: { node: OrgNode; current?: boolean }) {
  const card = (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all shrink-0 ${
        current
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm'
      }`}
      style={{ width: CARD_W }}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none ${
          current ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {initials(node.name) || <RiUserLine size={14} />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${current ? 'text-indigo-900' : 'text-gray-900'}`}>
          {node.name}
        </p>
        {node.role && <p className="text-xs text-gray-500 truncate">{node.role}</p>}
      </div>
    </div>
  )

  if (current) return card
  return <Link to={`/people/${node.id}`} className="block shrink-0">{card}</Link>
}

export function OrgChart({ current, manager, reports }: Props) {
  if (!manager && reports.length === 0) return null

  const reportsW = reports.length * CARD_W + Math.max(0, reports.length - 1) * GAP

  // SVG x-positions relative to the left edge of the reports row
  const firstCx = CARD_W / 2
  const lastCx  = (reports.length - 1) * (CARD_W + GAP) + CARD_W / 2

  return (
    // overflow-x-auto so wide report rows scroll rather than clip inside the modal
    <div className="overflow-x-auto">
      {/*
        flex-col + items-center keeps every row centered over the same axis.
        The vertical `w-px` dividers are 1px wide and naturally land on that axis.
        The SVG and reports row share the same width (reportsW) so they align.
      */}
      <div className="flex flex-col items-center py-2 gap-0">

        {/* Manager */}
        {manager && (
          <>
            <PersonCard node={manager} />
            <div className="w-px h-5 bg-gray-200" />
          </>
        )}

        {/* Current person */}
        <PersonCard node={current} current />

        {/* Reports */}
        {reports.length > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200" />

            {reports.length === 1 ? (
              <PersonCard node={reports[0]} />
            ) : (
              <>
                {/* Branch: horizontal bar + vertical drops, sized to match reports row */}
                <svg
                  width={reportsW}
                  height={20}
                  style={{ display: 'block', flexShrink: 0 }}
                >
                  {/* Horizontal bar connecting first and last card centers */}
                  <line x1={firstCx} y1={0} x2={lastCx} y2={0} stroke="#e5e7eb" strokeWidth="1" />
                  {/* Vertical drop to each card */}
                  {reports.map((_, i) => {
                    const cx = i * (CARD_W + GAP) + CARD_W / 2
                    return (
                      <line key={i} x1={cx} y1={0} x2={cx} y2={20} stroke="#e5e7eb" strokeWidth="1" />
                    )
                  })}
                </svg>

                {/* Report cards — same width as the SVG above */}
                <div className="flex shrink-0" style={{ gap: GAP }}>
                  {reports.map(r => <PersonCard key={r.id} node={r} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
