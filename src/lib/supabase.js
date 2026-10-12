import { createClient } from '@supabase/supabase-js'

// 兜底默认值：Vercel 后台环境变量配不上时也能连上（anon key 为公开前端密钥，数据由 RLS 行级权限保护，可安全内置）
const FALLBACK_URL = 'https://njsdurynltbwhxfutgub.supabase.co'
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qc2R1cnlubHRid2h4ZnV0Z3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NTExMDQsImV4cCI6MjEwMzEyNzEwNH0.0JuPdG_e8DwEbLd6pspk_w3DN17RtoDm8TXNviaEj-0'

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY

if (!url || !anonKey || url.includes('your-project')) {
  console.warn('⚠️ 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请在 .env.local 中填写')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true }
})
