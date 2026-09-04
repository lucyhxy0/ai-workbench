// 前端调用 Vercel Serverless API 的封装
import { supabase } from './supabase.js'

const API_BASE = '/api'

async function post(path, body, { stream = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  if (stream) {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST', headers, body: JSON.stringify(body)
    })
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `请求失败 (${res.status})`)
  }
  return res.json()
}

export const api = {
  // AI 对话（流式）
  chatStream: (messages, model = 'deepseek-chat') =>
    post('/chat', { messages, model }, { stream: true }),
  // 生成晨报
  generateBriefing: (date) => post('/briefing', { date }),
  // Notion 同步
  notionSync: (payload) => post('/notion', payload),
  // 收藏夹 Inbox
  favoritesAdd: (payload) => post('/favorites', { action: 'add', ...payload }),
  favoritesSync: () => post('/favorites', { action: 'sync' }),
  favoritesRecat: (id, title) => post('/favorites', { action: 'recat', id, title }),
  // 估算三餐热量
  caloriesEstimate: (meals) => post('/calories', { meals }),
  // 每周健康诊断
  healthReport: (diet, profile) => post('/health-report', { diet, profile })
}
