// api/fridge.js — 用自然语言管理冰箱库存
// 识别"买了/吃了/还有/改保质期"等意图，直接读写 fridge 表
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const DEEPSEEK = process.env.DEEPSEEK_API_KEY

function client(token) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } })
}

// 中文数字 → 阿拉伯
const CN_NUM = { '一':1,'两':2,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 }
function parseQtyUnit(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(个|盒|袋|公斤|kg|斤|瓶|罐|包|根|颗|只|块|枚)?/i)
  if (m) return { quantity: parseFloat(m[1]), unit: m[2] || '' }
  const cm = text.match(/(一|两|二|三|四|五|六|七|八|九|十)\s*(个|盒|袋|公斤|kg|斤|瓶|罐|包|根|颗|只|块|枚)?/)
  if (cm) return { quantity: CN_NUM[cm[1]] || 1, unit: cm[2] || '' }
  return { quantity: null, unit: '' }
}

// 规则意图：不依赖模型，避免冰箱语句被误判为闲聊（纯字符串，避开正则解析问题）
function ruleIntent(message) {
  const t = message
  const has = (...kw) => kw.some(k => t.includes(k))
  if (has('吃了', '用了', '消耗', '去掉', '扔', '丢', '删', '没了', '没有')) return 'remove'
  if (has('改', '更新', '设置', '保质期')) return 'update'
  if (has('买了', '加了', '进货', '采购', '添', '补货', '补')) return 'add'
  if (has('冰箱', '库存')) return 'query'
  return 'chat'
}

// 字段抽取兜底（纯字符串，避开正则解析问题）
function regexExtract(message) {
  const { quantity, unit } = parseQtyUnit(message)
  let name = ''
  const verbs = ['买了', '加了', '进货', '采购', '添', '补', '吃了', '用了', '消耗', '去掉', '扔', '丢', '删']
  for (const v of verbs) {
    const idx = message.indexOf(v)
    if (idx >= 0) { name = message.slice(idx + v.length).trim(); break }
  }
  if (!name) {
    const idx = message.indexOf('冰箱')
    if (idx >= 0) {
      name = message.slice(idx + 2)
      for (const p of ['里', '中', '内']) if (name.startsWith(p)) name = name.slice(p.length)
      for (const p of ['还有', '有', '剩']) if (name.startsWith(p)) name = name.slice(p.length)
    }
  }
  name = name.trim()
  const tailUnits = ['公斤', 'kg', '斤', '个', '盒', '袋', '瓶', '罐', '包', '根', '颗', '只', '块', '枚', '啥', '什么', '哪些']
  for (const u of tailUnits) if (name.endsWith(u)) name = name.slice(0, name.length - u.length)
  return { name: name.trim(), quantity, unit, category: '', expiry: '' }
}

// 字段抽取：优先 DeepSeek，失败用正则兜底
async function extractFields(message) {
  const base = regexExtract(message)
  if (!DEEPSEEK || DEEPSEEK.includes('your-')) return base
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK}` },
      body: JSON.stringify({
        model: 'deepseek-chat', temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '抽取冰箱库存语句的字段，只返回 JSON：name(物品名),quantity(数字),unit(单位),category(分类),expiry(YYYY-MM-DD)。不含则不填。' },
          { role: 'user', content: message }
        ]
      })
    })
    const j = await r.json()
    const o = JSON.parse(j?.choices?.[0]?.message?.content || '{}')
    return {
      name: o.name || base.name,
      quantity: o.quantity != null ? Number(o.quantity) : base.quantity,
      unit: o.unit || base.unit,
      category: o.category || base.category,
      expiry: o.expiry || base.expiry
    }
  } catch {
    return base
  }
}

// 意图识别：规则优先，DeepSeek 只抽字段
async function classifyIntent(message) {
  const intent = ruleIntent(message)
  if (intent === 'chat') return { intent: 'chat' }
  const f = await extractFields(message)
  return { intent, ...f }
}

function normalizeName(name) {
  return (name || '').trim().replace(/[\s]+/g, '')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function listItems(sb, userId, name) {
  let q = sb.from('fridge').select('*').eq('user_id', userId).order('category')
  if (name) q = q.ilike('name', `%${name}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

async function ensureItem(sb, userId, name) {
  const { data } = await sb.from('fridge').select('*').eq('user_id', userId).ilike('name', name).maybeSingle()
  return data
}

async function handleAdd(sb, userId, intent) {
  const name = normalizeName(intent.name)
  if (!name) return { handled: true, reply: '请告诉我买了什么，比如"买了两盒鸡蛋"。' }
  const qty = intent.quantity == null || isNaN(intent.quantity) ? 1 : intent.quantity
  const unit = intent.unit || '个'
  const category = intent.category || '其他'
  const existing = await ensureItem(sb, userId, name)
  if (existing) {
    const newQty = Number(existing.quantity) + qty
    const patch = { quantity: newQty, updated_at: new Date().toISOString() }
    if (intent.unit) patch.unit = unit
    if (intent.category) patch.category = category
    if (intent.expiry) patch.expiry = intent.expiry
    const { error } = await sb.from('fridge').update(patch).eq('id', existing.id)
    if (error) throw error
    return { handled: true, reply: `✅ ${name} 已更新：现有 ${newQty}${unit}。` }
  }
  const insert = { user_id: userId, name, quantity: qty, unit, category }
  if (intent.expiry) insert.expiry = intent.expiry
  const { data, error } = await sb.from('fridge').insert(insert).select().single()
  if (error) throw error
  return { handled: true, reply: `✅ 已记录：${name} +${qty}${unit}。` }
}

async function handleRemove(sb, userId, intent) {
  const name = normalizeName(intent.name)
  if (!name) return { handled: true, reply: '请告诉我吃了/用了什么，比如"吃了3个苹果"。' }
  const existing = await ensureItem(sb, userId, name)
  if (!existing) return { handled: true, reply: `📝 冰箱里还没有「${name}」。` }
  const qty = intent.quantity == null || isNaN(intent.quantity) ? Number(existing.quantity) : intent.quantity
  const newQty = Number(existing.quantity) - qty
  if (newQty <= 0) {
    const { error } = await sb.from('fridge').delete().eq('id', existing.id)
    if (error) throw error
    return { handled: true, reply: `✅ ${name} 已用完（${existing.quantity}${existing.unit}），已从冰箱移除。` }
  }
  const { error } = await sb.from('fridge').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id)
  if (error) throw error
  return { handled: true, reply: `✅ ${name} 已消耗 ${qty}${existing.unit}，剩余 ${newQty}${existing.unit}。` }
}

async function handleUpdate(sb, userId, intent) {
  const name = normalizeName(intent.name)
  if (!name) return { handled: true, reply: '请告诉我改什么，比如"牛奶保质期改成2026-09-10"。' }
  const existing = await ensureItem(sb, userId, name)
  if (!existing) return { handled: true, reply: `📝 冰箱里还没有「${name}」，可以先"买了${name}"。` }
  const patch = { updated_at: new Date().toISOString() }
  if (intent.quantity != null && !isNaN(intent.quantity)) patch.quantity = Number(intent.quantity)
  if (intent.unit) patch.unit = intent.unit
  if (intent.category) patch.category = intent.category
  if (intent.expiry) patch.expiry = intent.expiry
  const { error } = await sb.from('fridge').update(patch).eq('id', existing.id)
  if (error) throw error
  return { handled: true, reply: `✅ ${name} 已更新。` }
}

async function handleQuery(sb, userId, intent) {
  const name = normalizeName(intent.name)
  const items = await listItems(sb, userId, name)
  if (!items.length) {
    return { handled: true, reply: name ? `📝 冰箱里没找到「${name}」。` : '📝 冰箱目前是空的。' }
  }
  const lines = items.map(i => {
    let s = `• ${i.name}：${i.quantity}${i.unit || '个'}`
    if (i.category) s += `（${i.category}）`
    if (i.expiry) {
      const days = Math.ceil((new Date(i.expiry) - new Date(today())) / 86400000)
      s += days < 0 ? ` ⚠️过期${Math.abs(days)}天` : days <= 3 ? ` 剩${days}天` : ` 保质期至${i.expiry}`
    }
    return s
  })
  return { handled: true, reply: `🧊 冰箱库存：\n${lines.join('\n')}` }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })
  if (!URL || !ANON) return res.status(500).json({ error: '服务端环境变量 SUPABASE_URL / SUPABASE_ANON_KEY 未配置' })

  const token = auth.replace('Bearer ', '')
  const sb = client(token)
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: '登录失效' })

  const { message } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message 不能为空' })

  try {
    const intent = await classifyIntent(message)
    if (intent.intent === 'chat') return res.json({ handled: false })

    let result
    if (intent.intent === 'add') result = await handleAdd(sb, user.id, intent)
    else if (intent.intent === 'remove') result = await handleRemove(sb, user.id, intent)
    else if (intent.intent === 'update') result = await handleUpdate(sb, user.id, intent)
    else if (intent.intent === 'query') result = await handleQuery(sb, user.id, intent)
    else result = { handled: false }

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e?.message || '冰箱库存操作失败' })
  }
}
