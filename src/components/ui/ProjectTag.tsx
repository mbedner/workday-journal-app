import { Link } from 'react-router-dom'

interface Props {
  name: string
  /** If provided, renders as a Link to /projects/:projectId */
  projectId?: string
  className?: string
}

const base = 'text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium'

export function ProjectTag({ name, projectId, className = '' }: Props) {
  if (projectId) {
    return (
      <Link
        to={`/projects/${projectId}`}
        className={`${base} hover:bg-indigo-100 transition-colors ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {name}
      </Link>
    )
  }
  return <span className={`${base} ${className}`}>{name}</span>
}
