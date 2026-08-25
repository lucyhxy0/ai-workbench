// api/favorites.js — 收藏夹 Inbox：B站/抖音 收录 + DeepSeek 自动分类
import { createClient } from '@supabase/supabase-js'

const CATS = ['猫', '经济股票', '乐高', '做饭', '听歌', '其他']
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const DEEPSEEK = process.env.DEEPSEEK_API_KEY

function client(token) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } })
}

async function classify(title = '') {
  if (!DEEPSEEK || DEEPSEEK.includes('your-')) return '其他'
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        messages: [
          { role: 'system', content: `你是分类器。只能回复以下之一，不要解释：${CATS.join(' / ')}` },
          { role: 'user', content: title || '无标题' }
        ]
      })
    })
    const j = await r.json()
    const txt = (j.choices?.[0]?.message?.content || '其他').trim()
    return CATS.includes(txt) ? txt : '其他'
  } catch {
    return '其他'
  }
}

async function syncBilibili(sb, userId) {
  const sess = process.env.BILIBILI_SESSDATA
  if (!sess) return { synced: 0, note: '未配置 BILIBILI_SESSDATA' }
  // 拉取收藏夹列表
  const folders = await fetch('https://api.bilibili.com/x/v3/fav/folder/created/list-all', {
    headers: { Cookie: `SESSDATA=${sess}` }
  }).then(r => r.json()).catch(() => null)
  const list = folders?.data?.list || []
  let synced = 0
  for (const f of list) {
    const res = await fetch(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${f.id}&ps=20&pn=1`, {
      headers: { Cookie: `SESSDATA=${sess}` }
    }).then(r => r.json()).catch(() => null)
    for (const it of res?.data?.medias || []) {
      const title = it.title || ''
      const cat = await classify(title)
      const { error } = await sb.from('favorites').insert({
        user_id: userId, source: 'bilibili', title,
        url: it.link || `https://www.bilibili.com/video/${it.bvid}`, category: cat
      })
      if (!error) synced++
    }
  }
  return { synced, note: 'B站同步完成' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })
  const token = auth.replace('Bearer ', '')
  const sb = client(token)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: '登录失效' })

  const body = req.body || {}
  try {
    if (body.action === 'add') {
      const cat = await classify(body.title || '')
      const { data, error } = await sb.from('favorites').insert({
        user_id: user.id, source: body.source || 'douyin',
        title: body.title || '未命名', url: body.url || '', category: cat
      }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ item: data, category: cat })
    }
    if (body.action === 'sync') {
      const r = await syncBilibili(sb, user.id)
      return res.json(r)
    }
    if (body.action === 'recat') {
      const cat = await classify(body.title || '')
      const { error } = await sb.from('favorites').update({ category: cat }).eq('id', body.id).eq('user_id', user.id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ category: cat })
    }
    return res.status(400).json({ error: '未知操作' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
