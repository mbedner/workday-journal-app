import { RiUserLine } from '@remixicon/react'
import { Person } from '../../types'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  if (person.avatar_url) {
    return <img src={person.avatar_url} alt={person.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <div
      className="rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(person.name) || <RiUserLine size={size * 0.5} />}
    </div>
  )
}
