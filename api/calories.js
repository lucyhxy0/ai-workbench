// api/calories.js — 根据三餐/加餐文字估算热量(千卡)
// 采用 DeepSeek 在线估算（原来的方式）：模型读懂自由文本，按各餐估算热量，更准确。
// 输入：{ meals: { breakfast, lunch, dinner, afternoon_tea, drinks } } 各餐文字
// 输出：{ calories: { breakfast, lunch, dinner, afternoon_tea, drinks } } 各餐千卡
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })

  const { meals } = req.body || {}
  const fields = ['breakfast', 'lunch', 'dinner', 'afternoon_tea', 'drinks']
  const dk = process.env.DEEPSEEK_API_KEY
  if (!dk || dk.includes('your-')) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' })

  const mealText = fields.map(f => `${f}: ${((meals && meals[f]) || '').trim() || '（未填写）'}`).join('\n')

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dk}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              '你是营养热量估算助手。根据用户描述的一日各餐饮食，估算每餐的大致热量(千卡 kcal)。\n' +
              '只输出 JSON，结构：{"calories":{"breakfast":数字,"lunch":数字,"dinner":数字,"afternoon_tea":数字,"drinks":数字}}。\n' +
              '未填写的餐填 0。估算基于常见食物的典型热量，给出整数千卡。\n' +
              '注意：要结合数量(如"两个鸡蛋"按 2 份算)、烹饪方式(油炸/红烧热量更高)合理估算。\n' +
              '不要任何解释，只输出 JSON。'
          },
          { role: 'user', content: mealText }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return res.status(502).json({ error: 'DeepSeek 调用失败 (' + r.status + ')' })
    }
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content || '{}'
    const o = JSON.parse(c)
    const cal = o.calories || {}
    const out = {}
    for (const f of fields) out[f] = Number(cal[f]) || 0
    res.json({ calories: out })
  } catch (e) {
    res.status(500).json({ error: '估算失败：' + e.message })
  }
}
