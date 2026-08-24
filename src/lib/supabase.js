import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey || url.includes('your-project')) {
  console.warn('⚠️ 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请在 .env.local 中填写')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true }
})
