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

function PersonCard({ node, current = false }: { node: OrgNode; current?: boolean }) {
  const card = (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
        current
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm'
      }`}
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
  return <Link to={`/people/${node.id}`} className="block">{card}</Link>
}

export function OrgChart({ current, manager, reports }: Props) {
  if (!manager && reports.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {/* Manager */}
      {manager && (
        <div className="flex flex-col gap-1">
          <PersonCard node={manager} />
          <div className="w-px h-4 bg-gray-200 ml-7" />
        </div>
      )}

      {/* Current person */}
      <PersonCard node={current} current />

      {/* Reports */}
      {reports.length > 0 && (
        <>
          <div className="w-px h-4 bg-gray-200 ml-7" />
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 mb-1">
            People reporting to {current.name}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {reports.map(r => <PersonCard key={r.id} node={r} />)}
          </div>
        </>
      )}
    </div>
  )
}
