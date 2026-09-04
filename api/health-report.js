// api/health-report.js — 每周健康诊断
// 前端把最近 7 天 diet 记录 + 健康档案 profile 传进来，
// 服务端调 DeepSeek 生成结构化诊断，只做 AI 调用，不碰数据库。
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })

  const { diet = [], profile = {} } = req.body || {}
  const dk = process.env.DEEPSEEK_API_KEY
  if (!dk || dk.includes('your-')) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' })

  // 把 7 天数据压成易读文本
  const weekText = diet.map(d => {
    const c = d.calories || {}
    const kcal = (c.breakfast || 0) + (c.lunch || 0) + (c.dinner || 0) + (c.afternoon_tea || 0) + (c.drinks || 0)
    const vits = []
    if (d.vitamin_d_am) vits.push('维D早')
    if (d.vitamin_d_pm) vits.push('维D晚')
    if (d.vitamin_b_am) vits.push('维B早')
    if (d.vitamin_b_pm) vits.push('维B晚')
    if (d.inositol_am) vits.push('肌醇早')
    if (d.inositol_pm) vits.push('肌醇晚')
    return `日期${d.date} | 热量${kcal}kcal(早${c.breakfast || 0}/午${c.lunch || 0}/晚${c.dinner || 0}/茶${c.afternoon_tea || 0}/饮${c.drinks || 0}) | 体重${d.weight ?? '-'}kg 体脂${d.body_fat ?? '-'}% | 维生素[${vits.join(',') || '无'}] | 备注:${d.note || '无'}`
  }).join('\n')

  const profileText = Object.entries(profile || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('；') || '（未填写健康档案）'

  const user = `【用户健康档案】${profileText}\n\n【最近7天饮食记录】\n${weekText || '（无记录）'}`

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
              '你是资深健康管理师。根据用户的健康档案和最近7天饮食记录，输出一份周度健康诊断。只输出JSON，结构如下：\n' +
              '{\n' +
              '  "score": 0-100的整数（本周健康综合分）,\n' +
              '  "calorie": {"avg": 数字(日均千卡), "target": 数字或null, "status": "偏低/适中/偏高", "note": "一句话"},\n' +
              '  "weight": {"trend": "下降/平稳/上升", "change": 数字(kg,正为增负为减)或null, "note": "一句话"},\n' +
              '  "vitamin": {"rate": "如85%", "missed": ["维D 晚"等漏打卡项], "note": "一句话"},\n' +
              '  "highlights": ["本周亮点或风险1","亮点或风险2"],\n' +
              '  "advice": ["可执行建议1","可执行建议2","可执行建议3"],\n' +
              '  "summary": "100字以内的总体评价"\n' +
              '}\n' +
              '注意：结合档案中的目标体重/目标热量/病史/过敏/用药给出个性化建议；不要编造记录里没有的数据；语气温和专业。'
          },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    })
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content || '{}'
    const o = JSON.parse(c)
    res.json({ result: o })
  } catch (e) {
    res.status(500).json({ error: '诊断生成失败：' + e.message })
  }
}
