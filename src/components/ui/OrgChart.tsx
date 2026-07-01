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

const CARD_W = 192 // matches w-48
const GAP     = 16  // matches gap-4

function PersonCard({ node, current = false }: { node: OrgNode; current?: boolean }) {
  const card = (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border w-48 shrink-0 transition-all ${
      current
        ? 'border-indigo-300 bg-indigo-50 shadow-sm'
        : 'border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none ${
        current ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}>
        {initials(node.name) || <RiUserLine size={14} />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${current ? 'text-indigo-900' : 'text-gray-900'}`}>
          {node.name}
        </p>
        {node.role && (
          <p className="text-xs text-gray-500 truncate">{node.role}</p>
        )}
      </div>
    </div>
  )

  if (current) return card
  return <Link to={`/people/${node.id}`} className="block">{card}</Link>
}

function VLine() {
  return <div className="w-px h-5 bg-gray-200" style={{ marginLeft: CARD_W / 2 - 0.5 }} />
}

export function OrgChart({ current, manager, reports }: Props) {
  if (!manager && reports.length === 0) return null

  const totalW   = reports.length * CARD_W + (reports.length - 1) * GAP
  const firstCx  = CARD_W / 2
  const lastCx   = (reports.length - 1) * (CARD_W + GAP) + CARD_W / 2

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex flex-col" style={{ width: manager || reports.length <= 1 ? CARD_W : totalW }}>

        {/* Manager level */}
        {manager && (
          <>
            <PersonCard node={manager} />
            <VLine />
          </>
        )}

        {/* Current person */}
        <PersonCard node={current} current />

        {/* Reports level */}
        {reports.length > 0 && (
          <>
            {/* Vertical drop from current person */}
            {reports.length === 1 ? (
              <>
                <VLine />
                <PersonCard node={reports[0]} />
              </>
            ) : (
              <>
                {/* Short vertical to the branch point */}
                <div className="w-px h-5 bg-gray-200" style={{ marginLeft: firstCx + (lastCx - firstCx) / 2 - 0.5 }} />

                {/* SVG: horizontal bar + vertical drops */}
                <svg
                  width={totalW}
                  height={20}
                  style={{ display: 'block', overflow: 'visible' }}
                >
                  {/* Horizontal bar connecting all reports */}
                  <line x1={firstCx} y1={0} x2={lastCx} y2={0} stroke="#e5e7eb" strokeWidth="1" />
                  {/* Vertical drop to each report */}
                  {reports.map((_, i) => {
                    const cx = i * (CARD_W + GAP) + CARD_W / 2
                    return <line key={i} x1={cx} y1={0} x2={cx} y2={20} stroke="#e5e7eb" strokeWidth="1" />
                  })}
                </svg>

                {/* Report cards */}
                <div className="flex" style={{ gap: GAP, width: totalW }}>
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
