// api/favorites.js — 收藏夹 Inbox：B站/抖音 收录 + 自动分类
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const CATS = ['猫', '经济股票', '乐高', '做饭', '听歌', '其他']
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const DEEPSEEK = process.env.DEEPSEEK_API_KEY

function client(token) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } })
}

// 带超时的 fetch（Vercel 云端外网偶尔慢，避免整函数卡死）
async function fetchTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ===== B站 WBI 签名（2023 起收藏夹等接口强制要求，否则 code=-400）=====
const WBI_PERM = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
function wbiMixin(imgKey, subKey) {
  const o = imgKey + subKey
  return WBI_PERM.map(i => o[i]).join('').slice(0, 32)
}
function wbiSign(params, mixinKey) {
  const p = { ...params, wts: Math.floor(Date.now() / 1000) }
  const q = Object.keys(p).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`).join('&')
  return { ...p, w_rid: crypto.createHash('md5').update(q + mixinKey).digest('hex') }
}

// 本地关键词分类（毫秒级、不联网，覆盖绝大多数场景）
function localClassify(title = '') {
  const t = (title || '').toLowerCase()
  const rules = [
    ['猫', ['猫', 'cat', '喵', '布偶', '橘猫', '英短', '狸花', '美短', '猫粮', '铲屎', '撸猫', '猫砂', '养猫']],
    ['经济股票', ['股票', 'a股', '美股', '基金', 'etf', '财经', '经济', '财报', '大盘', '港股', '指数', '交易', '操盘', '买入', '卖出', '投资', '美联储', '央行', '汇率', '黄金', '比特币', 'crypto', 'k线', '复盘', '涨停', '跌停']],
    ['乐高', ['乐高', 'lego', '机器人', '编程', 'arduino', 'microbit', '树莓派', '单片机', '创客', 'scratch', 'python教程']],
    ['做饭', ['做饭', '菜谱', '美食', '烘焙', '料理', '食谱', '下厨', '做法', '烹饪', '炸', '炒', '蒸', '炖', '烤箱', '面食', '甜点', '菜', '下饭', '汤']],
    ['听歌', ['歌', '音乐', 'music', '专辑', '单曲', '华语', '欧美', '日语', 'live', '演唱会', '钢琴', '吉他', '听歌', '网易云', 'qq音乐', 'spotify', 'bgm', '翻唱']]
  ]
  for (const [cat, kws] of rules) {
    if (kws.some(k => t.includes(k))) return cat
  }
  return null
}

// 主分类：本地关键词命中即返回；拿不准才用 DeepSeek（带 4s 超时，失败回退“其他”）
async function classify(title = '') {
  const local = localClassify(title)
  if (local) return local
  if (!DEEPSEEK || DEEPSEEK.includes('your-')) return '其他'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
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
    clearTimeout(t)
    const j = await r.json().catch(() => ({}))
    const txt = (j.choices?.[0]?.message?.content || '其他').trim()
    return CATS.includes(txt) ? txt : '其他'
  } catch {
    return '其他'
  }
}

async function syncBilibili(sb, userId) {
  const sess = process.env.BILIBILI_SESSDATA
  if (!sess) return { synced: 0, note: '未配置 BILIBILI_SESSDATA（去 Vercel 环境变量补上，并勾选 Production）' }
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
  const H = { Referer: 'https://www.bilibili.com', 'User-Agent': UA, Cookie: `SESSDATA=${sess}` }

  // 1) 取登录态 mid + WBI 密钥（nav 不需签名，公开返回 wbi_img）
  const navJ = await fetchTimeout('https://api.bilibili.com/x/web-interface/nav', { headers: H })
    .then(r => r.json()).catch(() => null)
  if (!navJ || navJ.code !== 0) {
    const c = navJ?.code
    return { synced: 0, note: c === -101 ? 'SESSDATA 已失效（B站显示未登录），请重新从浏览器复制' : `B站导航接口异常 code=${c ?? 'null'}（网络或令牌问题）` }
  }
  if (!navJ.data?.isLogin) {
    return { synced: 0, note: 'SESSDATA 已失效（B站显示未登录），请重新从浏览器复制 Cookie 里的 SESSDATA' }
  }
  const mid = navJ.data.mid
  const img = navJ.data.wbi_img.img_url.split('/').pop().split('.')[0]
  const sub = navJ.data.wbi_img.sub_url.split('/').pop().split('.')[0]
  const mixin = wbiMixin(img, sub)

  // 2) 收藏夹列表（必须带 up_mid + WBI 签名，否则 code=-400）
  const flParams = wbiSign({ up_mid: mid, pn: 1, ps: 20 }, mixin)
  const folders = await fetchTimeout('https://api.bilibili.com/x/v3/fav/folder/created/list?' + new URLSearchParams(flParams), { headers: H })
    .then(r => r.json()).catch(() => null)
  if (!folders || folders.code !== 0) {
    return { synced: 0, note: `收藏夹接口异常 code=${folders?.code ?? 'null'}（SESSDATA 可能失效，请重新复制）` }
  }
  const list = folders?.data?.list || []
  if (list.length === 0) return { synced: 0, note: `未读到收藏夹——请确认两点：①B站收藏夹已设为「公开」（私密收藏夹 API 读不到，可先在 B站 App 里把收藏夹可见性改为公开）；②Vercel 环境变量 BILIBILI_SESSDATA 是最新复制的值。当前登录账号 mid=${mid}` }

  // 去重：已收录的 url 跳过，避免重复刷
  const { data: ex } = await sb.from('favorites').select('url').eq('user_id', userId)
  const have = new Set((ex || []).map(e => e.url))

  let synced = 0
  let foldersWithVideos = 0
  const CAP = 120 // 单次同步数量上限，避免超时
  for (const f of list) {
    if (synced >= CAP) break
    // resource/list 必须带 keyword/order/type/web_location 这几个参数，否则 B站返回 -400
    const rlParams = wbiSign({ media_id: f.id, pn: 1, ps: 50, keyword: '', order: 'mtime', type: 0, web_location: '333.1007' }, mixin)
    const res = await fetchTimeout('https://api.bilibili.com/x/v3/fav/resource/list?' + new URLSearchParams(rlParams), { headers: H })
      .then(r => r.json()).catch(() => null)
    if (!res || res.code !== 0) continue
    const medias = res?.data?.medias || []
    if (medias.length) foldersWithVideos++
    for (const it of medias) {
      if (synced >= CAP) break
      const url = `https://www.bilibili.com/video/${it.bvid}`
      if (have.has(url)) continue
      const title = it.title || ''
      const cat = await classify(title)
      const { error } = await sb.from('favorites').insert({
        user_id: userId, source: 'bilibili', title, url, category: cat
      })
      if (!error) { synced++; have.add(url) }
    }
  }
  let note
  if (synced > 0) note = 'B站同步完成'
  else if (foldersWithVideos > 0) note = '已读收藏夹，但 0 条新增（可能都已收录过）'
  else note = '收藏夹已读取，但视频列表拉取失败（B站 resource/list 异常，可能 SESSDATA 已失效或缺少参数）'
  return { synced, note }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })
  // 服务端环境变量缺失时，给出清晰提示而不是笼统 500
  if (!URL || !ANON) {
    return res.status(200).json({ synced: 0, note: '服务端环境变量 SUPABASE_URL / SUPABASE_ANON_KEY 未配置（请在 Vercel → Settings → Environment Variables 添加，并勾选 Production）' })
  }
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
    return res.status(500).json({ error: e?.message || '服务端异常' })
  }
}
