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
              '你是资深健康管理师，专长多囊卵巢综合征(PCOS)的生活方式管理。必须严格依据以下权威指南给出诊断与建议：\n' +
              '【遵循的权威指南核心】\n' +
              '1. AES-PCOS 2018 国际循证指南 与 2018 中国PCOS诊疗指南：生活方式干预(饮食+运动+行为)是 PCOS 一线、首选基础治疗，应先于药物。\n' +
              '2. 减重：超重/肥胖PCOS减轻基线体重5–10%即可显著改善月经周期、排卵、胰岛素抵抗(IR)与高雄表现；采用适度热量缺口，避免长期<1000kcal/日损害代谢。\n' +
              '3. 饮食：以低升糖指数(低GI)/低升糖负荷为核心，严格限制精制碳水与添加糖；保证每餐优质蛋白；增加蔬菜与膳食纤维；主食偏向全谷物/杂粮。\n' +
              '4. 运动：每周≥150分钟中等强度有氧 + 每周≥2次抗阻训练；减少久坐，餐后散步有助平稳血糖。\n' +
              '5. 改善IR与营养：肌醇(40:1 myo-/D-手性肌醇配比)有循证支持；保证维D(缺乏与IR、排卵相关)、Omega-3、镁、B族；补铁须先查铁蛋白，勿盲目补。\n' +
              '6. 作息与压力：规律睡眠、限酒、压力管理，影响下丘脑-垂体-卵巢轴与IR。\n' +
              '根据用户健康档案(含PCOS偏代谢型/高度怀疑IR/GERD/用药/饮食偏好)与最近7天饮食记录，输出个性化周度诊断。只输出JSON，结构如下：\n' +
              '{\n' +
              '  "score": 0-100整数(本周健康综合分),\n' +
              '  "calorie": {"avg":数字(日均千卡),"target":数字或null,"status":"偏低/适中/偏高","note":"一句话"},\n' +
              '  "weight": {"trend":"下降/平稳/上升","change":数字(kg)或null,"note":"一句话"},\n' +
              '  "vitamin": {"rate":"如85%","missed":["维D 晚"],"note":"一句话"},\n' +
              '  "highlights": ["本周亮点或风险1","亮点或风险2"],\n' +
              '  "advice": ["可执行建议1（〔依据：AES-PCOS 2018 一线生活方式干预〕）","建议2（〔依据：2018中国PCOS指南 低GI饮食〕）","建议3（〔依据：指南 运动处方〕）"],\n' +
              '  "summary": "100字内总体评价，含与PCOS指南符合度",\n' +
              '  "guide_basis": "一句话说明本周诊断总体依据哪些指南核心"\n' +
              '}\n' +
              '要求：每条advice必须在该条末尾用「〔依据：具体指南条目〕」标注出处；结合档案目标体重/目标热量/病史/过敏/用药给出个性化建议；不要编造记录里没有的数据；语气温和专业。'
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
