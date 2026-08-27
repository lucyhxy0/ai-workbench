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

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dk}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是营养师，根据食物文字描述估算每餐热量(千卡)。只输出JSON：{breakfast,lunch,dinner,afternoon_tea,drinks}，每个为数字或0。不要解释。' },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    })
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content || '{}'
    const o = JSON.parse(c)
    res.json({
      calories: {
        breakfast: Number(o.breakfast) || 0,
        lunch: Number(o.lunch) || 0,
        dinner: Number(o.dinner) || 0,
        afternoon_tea: Number(o.afternoon_tea) || 0,
        drinks: Number(o.drinks) || 0
      }
    })
  } catch (e) {
    res.status(500).json({ error: '热量估算失败：' + e.message })
  }
}
