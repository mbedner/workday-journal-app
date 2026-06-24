import { supabase } from './supabase'
import { Person } from '../types'

/** Create mention relationships for a source, ignoring ones that already exist. */
export async function createMentions(opts: {
  personIds: string[]
  sourceType: 'journal' | 'meeting' | 'project'
  sourceId: string
}): Promise<void> {
  if (!opts.personIds.length) return
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('person_mentions').upsert(
    opts.personIds.map(personId => ({
      person_id: personId,
      user_id: user!.id,
      source_type: opts.sourceType,
      source_id: opts.sourceId,
    })),
    { onConflict: 'person_id,source_type,source_id', ignoreDuplicates: true }
  )
}

/** Replace all mentions for a given source — used when editing so removed @mentions are cleared. */
export async function syncMentions(opts: {
  personIds: string[]
  sourceType: 'journal' | 'meeting' | 'project'
  sourceId: string
}): Promise<void> {
  await supabase
    .from('person_mentions')
    .delete()
    .eq('source_type', opts.sourceType)
    .eq('source_id', opts.sourceId)
  await createMentions(opts)
}

/** Extract @Name mentions from plain text and resolve them against known people (case-insensitive, first-name or full-name match). */
export function extractMentionedPeople(text: string, people: Person[]): Person[] {
  const matches = text.match(/@([A-Za-z][A-Za-z'-]*(?:\s[A-Za-z][A-Za-z'-]*)?)/g) ?? []
  const found = new Map<string, Person>()
  for (const raw of matches) {
    const name = raw.slice(1).trim().toLowerCase()
    const person = people.find(p => {
      const full = p.name.trim().toLowerCase()
      const first = full.split(' ')[0]
      return full === name || first === name
    })
    if (person) found.set(person.id, person)
  }
  return [...found.values()]
}
