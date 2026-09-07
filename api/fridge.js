// api/fridge.js — 用自然语言管理冰箱库存
// 识别"买了/吃了/还有/改保质期"等意图，直接读写 fridge 表
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const DEEPSEEK = process.env.DEEPSEEK_API_KEY

function client(token) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } })
}

async function classifyIntent(message) {
  if (!DEEPSEEK || DEEPSEEK.includes('your-')) {
    return { intent: 'chat' }
  }
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是冰箱库存意图识别器。请分析用户输入，只返回 JSON，不要任何解释。\n' +
              'JSON 字段：\n' +
              '  intent: "add" | "remove" | "update" | "query" | "chat"\n' +
              '  name: 物品名称（如有，尽量用标准名，如"鸡蛋"）\n' +
              '  quantity: 数字（操作的数量，默认 1；删除不指定数量则全部删除）\n' +
              '  unit: 单位，如"个/盒/袋/kg/瓶/罐/包/斤"\n' +
              '  category: 分类，如"蔬菜/水果/肉/蛋/奶/调料/饮品/其他"\n' +
              '  expiry: 保质期，格式 YYYY-MM-DD（仅 update/add 且用户提到时）\n' +
              '  reply: 一句自然语言回复（用于直接返回给用户）\n' +
              '规则：\n' +
              '1. "买了/加了/进货/有" → add\n' +
              '2. "吃了/用了/消耗/去掉/扔/删" → remove\n' +
              '3. "改/更新/设置/保质期/数量" → update\n' +
              '4. "还有/有什么/列表/查/剩多少" → query\n' +
              '5. 与冰箱库存无关的普通对话 → chat\n' +
              '6. 数量和单位要从自然语言中提取，如"两盒鸡蛋" → quantity=2, unit=盒\n' +
              '7. 如果用户说"买了鸡蛋"没数量，quantity=1, unit=个'
          },
          { role: 'user', content: message }
        ]
      })
    })
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content || '{}'
    const o = JSON.parse(c)
    return {
      intent: ['add', 'remove', 'update', 'query'].includes(o.intent) ? o.intent : 'chat',
      name: o.name || '',
      quantity: o.quantity == null ? null : Number(o.quantity),
      unit: o.unit || '',
      category: o.category || '',
      expiry: o.expiry || '',
      reply: o.reply || ''
    }
  } catch {
    return { intent: 'chat' }
  }
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

    // 如果 AI 已经给了回复，优先用 AI 的；否则用后端生成的
    if (intent.reply && result.handled) result.reply = intent.reply
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e?.message || '冰箱库存操作失败' })
  }
}
