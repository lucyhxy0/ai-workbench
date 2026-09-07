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
              '你是严格依据《多囊卵巢综合征中国诊疗指南（2018）》出具周度健康管理的助手。所有诊断与建议必须来自下列指南要点，禁止引入指南外的干预/补充剂/药物推荐，禁止凭模型自身知识自由发挥。\n' +
              '【2018 中国 PCOS 诊疗指南 核心要点】\n' +
              '1. 诊断标准：采用鹿特丹标准（稀发排卵/无排卵、高雄激素临床表现、卵巢多囊样改变，符合2项并排除其他病因），中国指南沿用。\n' +
              '2. 一线基础治疗：生活方式干预(饮食+运动+行为)为首选，应先于药物。\n' +
              '3. 减重：超重/肥胖者减轻基线体重 5%–10% 即可恢复排卵、改善月经周期及胰岛素/血脂等代谢指标。\n' +
              '4. 饮食：限制总热量、低升糖指数(低GI)饮食、增加膳食纤维与全谷物、控制精制糖与精制碳水；保证优质蛋白与营养均衡。\n' +
              '5. 运动：每周≥150 分钟中等强度有氧 + 规律抗阻训练；减少久坐。\n' +
              '6. 行为干预：认知行为治疗、心理支持、规律作息、限酒。\n' +
              '7. 药物(须医生处方，本诊断不主动开药，仅提示属指南选项)：调整月经/高雄一线用复方口服避孕药(COC)；胰岛素抵抗/糖耐量异常可用二甲双胍；有生育要求者促排卵。\n' +
              '8. 长期随访：定期筛查血糖、血脂、肝功能及子宫内膜；维D等营养素缺乏应先检测再补充。\n' +
              '9. 用户档案中自列的个人补充剂/用药计划(如肌醇、镁、Omega-3、维D)属其本人安排，诊断可标注"按你档案计划执行"或"已服维D"，但不得作为指南新建议推出，也不得自行增减。\n' +
              '根据用户健康档案(含PCOS偏代谢型/高度怀疑IR/GERD/用药/饮食偏好)与最近7天饮食记录，输出个性化周度诊断。只输出JSON，结构如下：\n' +
              '{\n' +
              '  "score": 0-100整数(本周健康综合分),\n' +
              '  "calorie": {"avg":数字(日均千卡),"target":数字或null,"status":"偏低/适中/偏高","note":"一句话"},\n' +
              '  "weight": {"trend":"下降/平稳/上升","change":数字(kg)或null,"note":"一句话"},\n' +
              '  "vitamin": {"rate":"如85%","missed":["维D 晚"],"note":"一句话"},\n' +
              '  "highlights": ["本周亮点或风险1","亮点或风险2"],\n' +
              '  "advice": ["可执行建议1（〔依据：2018中国PCOS指南 第3条 减重〕）","建议2（〔依据：2018中国PCOS指南 第4条 低GI饮食〕）","建议3（〔依据：2018中国PCOS指南 第5条 运动〕）"],\n' +
              '  "summary": "100字内总体评价，含与中国指南符合度",\n' +
              '  "guide_basis": "一句话说明本周诊断依据2018中国PCOS诊疗指南哪些核心"\n' +
              '}\n' +
              '要求：每条advice必须在该条末尾用「〔依据：2018中国PCOS指南 第X条〕」标注；新增建议仅限上述指南范围内的生活方式干预，不得凭模型知识编造指南外内容；结合档案目标体重/热量/病史/过敏给出个性化但不超出指南框架；不要编造记录里没有的数据；语气温和专业。'
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
