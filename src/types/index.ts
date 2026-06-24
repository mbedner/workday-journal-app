export interface JournalEntry {
  id: string
  user_id: string
  entry_date: string
  focus: string | null
  accomplished: string | null
  needs_attention: string | null
  reflection: string | null
  productivity_rating: number | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  projects?: Project[]
  tags?: Tag[]
}

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  completed_at: string | null
  source_type: 'manual' | 'journal' | 'transcript'
  source_id: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  projects?: Project[]
  tags?: Tag[]
}

export interface Transcript {
  id: string
  user_id: string
  meeting_title: string
  meeting_date: string | null
  attendees: string | null
  raw_transcript: string | null
  summary: string | null
  decisions: string | null
  action_items: string | null
  follow_ups: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  projects?: Project[]
  tags?: Tag[]
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  completed_at?: string | null
}

export interface Tag {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Subtask {
  id: string
  task_id: string
  user_id: string
  title: string
  completed: boolean
  position: number
  created_at: string
}

export interface SearchResult {
  id: string
  type: 'journal' | 'task' | 'transcript' | 'person'
  title: string
  date?: string
  body: string
  tags: string[]
  projects: string[]
  status?: string
  url: string
}

export type RelationshipType = 'coworker' | 'friend' | 'family' | 'acquaintance' | 'other'

export interface Person {
  id: string
  user_id: string
  name: string
  relationship_type: RelationshipType
  role: string | null
  organization: string | null
  where_met: string | null
  avatar_url: string | null
  /** Lightweight freeform sections, e.g. { Family: ['Married', 'Two children'], Interests: ['Hiking'] } */
  snapshot: Record<string, string[]>
  last_viewed_at: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  // Loaded client-side after fetch
  mention_count?: number
}

export interface PersonNote {
  id: string
  person_id: string
  user_id: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface PersonMention {
  id: string
  person_id: string
  user_id: string
  source_type: 'journal' | 'meeting' | 'project'
  source_id: string
  created_at: string
}
