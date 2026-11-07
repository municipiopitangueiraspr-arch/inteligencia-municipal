import { createClient } from '@supabase/supabase-js'

// Publishable key destinada ao uso no frontend; variáveis VITE_* têm prioridade.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qgkjnzcqjhhqdgxmvtew.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
