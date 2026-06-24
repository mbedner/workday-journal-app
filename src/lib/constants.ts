/**
 * PostgREST silently caps unpaginated selects at 1000 rows. These reference
 * hooks (projects, tags, attendees, people) load everything up front for
 * dropdowns/autocomplete rather than paginating, so they need an explicit
 * limit well above any realistic count — otherwise rows past 1000 vanish
 * with no error.
 */
export const REFERENCE_LIST_LIMIT = 5000
