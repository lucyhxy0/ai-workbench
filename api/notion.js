// api/notion.js — 将数据同步到 Notion
// 请求体: { token, parentPageId, data: { date, briefing, diet, trading, tasks } }
const NOTION = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

function rt(text) {
  // 单个 text 对象上限 2000 字符，超长拆分
  const chunks = []
  for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900))
  return chunks.map(c => ({ type: 'text', text: { content: c } }))
}
function para(text = '') {
  if (!text) text = '（空）'
  const chunks = []
  for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900))
  return chunks.map(c => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(c) } }))
}
function heading(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: rt(text) } }
}
function bullet(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(text) } }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!req.headers['authorization']) return res.status(401).json({ error: '未授权' })
  const { token, parentPageId, data } = req.body || {}
  if (!token || !parentPageId) return res.status(400).json({ error: '缺少 Notion token 或父页面 ID' })

  const { date, briefing, diet, trading, tasks = [] } = data || {}
  const blocks = []
  blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: rt(`工作台同步 · ${date || ''}`) } })

  // 晨报
  if (briefing) {
    blocks.push(heading('🌅 晨报'))
    blocks.push(para(briefing.summary || ''))
    if (briefing.us_market) blocks.push(bullet('🇺🇸 美股: ' + briefing.us_market))
    if (briefing.economy) blocks.push(bullet('📊 经济: ' + briefing.economy))
    if (briefing.domestic) blocks.push(bullet('🇨🇳 国内: ' + briefing.domestic))
  }

  // 饮食
  if (diet) {
    blocks.push(heading('🍱 饮食'))
    blocks.push(bullet('早餐: ' + (diet.breakfast || '—')))
    blocks.push(bullet('午餐: ' + (diet.lunch || '—')))
    blocks.push(bullet('晚餐: ' + (diet.dinner || '—')))
    blocks.push(bullet(`维生素: ${diet.vitamin_a ? 'A✓' : 'A✗'} ${diet.vitamin_b ? 'B✓' : 'B✗'}`))
  }

  // 操盘
  if (trading) {
    blocks.push(heading('📈 操盘'))
    blocks.push(bullet('操作: ' + (trading.operations || '—')))
    blocks.push(bullet('复盘: ' + (trading.review || '—')))
    if (trading.ai_analysis) blocks.push(bullet('AI分析: ' + trading.ai_analysis))
  }

  // 月度事务
  if (tasks.length) {
    blocks.push(heading('📅 月度事务'))
    tasks.forEach(t => blocks.push(bullet(`${t.name}（每月${t.day_of_month}号 · ${t.category}）${t.last_done ? ' 上次' + t.last_done : ''}`)))
  }

  // Notion 单次创建上限 100 块，超出截断（保留核心）
  const safe = blocks.slice(0, 100)
  try {
    const r = await fetch(`${NOTION}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Notion-Version': VERSION, Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        parent: { page_id: parentPageId.replace(/-/g, '') },
        properties: { title: { title: rt(`工作台同步 ${date || ''}`) } },
        children: safe
      })
    })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: j.message || 'Notion 写入失败' })
    res.json({ ok: true, pageId: j.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
