// api/calories.js — 根据三餐/加餐文字估算热量(千卡)，返回 JSON
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })

  const { meals } = req.body || {}
  const dk = process.env.DEEPSEEK_API_KEY
  if (!dk || dk.includes('your-')) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' })

  const safe = {
    breakfast: meals?.breakfast || '',
    lunch: meals?.lunch || '',
    dinner: meals?.dinner || '',
    afternoon_tea: meals?.afternoon_tea || '',
    drinks: meals?.drinks || ''
  }
  const user = `请估算以下各餐热量(千卡)，只输出JSON:\n` +
    `早餐: ${safe.breakfast}\n午餐: ${safe.lunch}\n晚餐: ${safe.dinner}\n下午茶: ${safe.afternoon_tea}\n饮品: ${safe.drinks}`

  // 中英文 key 都能映射到标准字段，避免 AI 输出中文 key 时前端取不到值
  const KEYMAP = {
    breakfast: 'breakfast', 早餐: 'breakfast', 早饭: 'breakfast',
    lunch: 'lunch', 午餐: 'lunch', 午饭: 'lunch',
    dinner: 'dinner', 晚餐: 'dinner', 晚饭: 'dinner',
    afternoon_tea: 'afternoon_tea', 下午茶: 'afternoon_tea',
    drinks: 'drinks', 饮品: 'drinks', 饮料: 'drinks', 喝水: 'drinks'
  }

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dk}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是营养师，根据食物文字描述估算每餐热量(千卡)。只输出JSON，键用中文：{"早餐":数字,"午餐":数字,"晚餐":数字,"下午茶":数字,"饮品":数字}。不要解释。' },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    })
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content || '{}'
    const o = JSON.parse(c)
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      const f = KEYMAP[String(k).trim()]
      if (f) out[f] = Number(v) || 0
    }
    res.json({
      calories: {
        breakfast: out.breakfast || 0,
        lunch: out.lunch || 0,
        dinner: out.dinner || 0,
        afternoon_tea: out.afternoon_tea || 0,
        drinks: out.drinks || 0
      }
    })
  } catch (e) {
    res.status(500).json({ error: '热量估算失败：' + e.message })
  }
}
