import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in your values.')
}

const client = createClient(supabaseUrl, supabaseAnonKey)

const IS_PREVIEW = supabaseUrl.includes('placeholder')

if (IS_PREVIEW) {
  // Stub out auth.getUser so page-level saves don't throw in preview mode
  client.auth.getUser = async () => ({
    data: {
      user: {
        id: 'preview-user-id',
        email: 'preview@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as any,
    },
    error: null,
  })
}

export const supabase = client
