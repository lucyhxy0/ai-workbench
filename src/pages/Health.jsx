import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, shiftDate, prettyDate } from '../lib/date.js'
import { api } from '../lib/api.js'

// AI 按用户发的《健康档案.md》(2026-09-04) 解析好的预设，进页面时静默写入数据库（不在页面显示）
const DEFAULT_PROFILE = {
  gender: '女',
  age: 28,
  height: 160,
  current_weight: 60.0,
  target_weight: '',
  target_calories: '1200-1600',
  conditions: '多囊卵巢综合征(PCOS，偏代谢型；月经稀发+高雄表现)\n胰岛素抵抗(高度怀疑，未OGTT确诊；餐后困倦、中心脂肪堆积)\n胃食管反流病(GERD)恢复期\n功能性消化不良/胃动力不足(早饱、餐后腹胀)\n缺铁风险(未查铁蛋白确诊)\n中心性肥胖(改善中：腰围83→77cm)',
  allergies: '对高浓度/血红素铁耐受差(既往口服血红素铁后口臭、胃肠不适)\n未见明确食物过敏记录',
  medications: '现服：维生素D(2026-07起持续，随含脂肪餐服)\n评估待加：镁(甘氨酸镁，晚200-300mg元素镁)、肌醇(40:1，每日约4g肌醇+100mg手性肌醇分两次随餐)、B族复合(活性叶酸+B12)、Omega-3鱼油、维生素K2(MK-7可选)',
  exercise: '餐后慢走15分钟(缓解困倦)\n规律运动未明确，可逐步增加',
  diet_prefs: '早餐必含蛋白质且每天吃\n每餐至少一种蔬菜\n杂粮饭为主食方向\n油炸外食≤2次/周\n辣卤≤1次/周\n精制碳水≤3次/周\n每日热量稳定1200-1600，避免长期<1000kcal',
  others: '月经延长约37天(正常上限35)、经期约4天且后2天咖啡色分泌物(排卵/黄体功能待关注)\n餐后困倦3-4年(高碳水/油炸后尤甚，评分可达10/10)\n不宁腿(夜间静息下肢酸麻)\n睡眠节律偏晚、入睡难、多梦、白天易疲劳\n指甲脆易断、膝盖易淤青\n体脂分布脸圆腹大、大腿上段粗\n建议就医：内分泌科优先，携本档案查 ①血常规+铁蛋白+血清铁 ②25-羟维D ③OGTT+胰岛素释放(HOMA-IR) ④性激素六项+盆腔超声 ⑤血脂+肝功 ⑥腹部彩超',
  // 以下为给 AI 诊断用的额外结构化字段（不显示在表单，但会一并发给模型）
  pcos_ir: 'PCOS偏代谢型 + 高度怀疑胰岛素抵抗；减脂方向正确(近1月体重-2kg、腰围-6cm、体脂-0.6%、BMI 60kg→23.4已回正常)',
  symptoms: '餐后困倦、不宁腿、睡眠晚/入睡难、早饱/餐后腹胀(菌菇杂粮加重)、偶有反酸、指甲脆、高雄表现(唇周小胡须/乳晕腹中线毛)',
  supplements_plan: '已服维D；待评估镁/肌醇/B族/Omega-3/K2；铁先查铁蛋白再定(倾向甘氨酸亚铁，避开茶/咖啡/钙同服、不与镁同服)',
  checkup_plan: '1.血常规+铁蛋白+血清铁 2.25-羟维D 3.OGTT+胰岛素释放 4.性激素六项+盆腔超声 5.血脂+肝功 6.腹部彩超',
  maintenance: '早餐含蛋白；热量1200-1600；油炸≤2/周、辣卤≤1/周、精制碳水≤3/周；每餐蔬菜；餐后慢走15min；每周量体重+体脂+腰围(重点腰围)'
}

function scoreColor(s) {
  if (s == null) return 'var(--ink-dim)'
  if (s >= 80) return '#2e9e5b'
  if (s >= 60) return '#d98a00'
  return '#c0392b'
}

export default function Health() {
  const [profile, setProfile] = useState({})
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const uid = user.id
      let { data: p } = await supabase.from('health_profile').select('*').eq('user_id', uid).maybeSingle()
      // 档案不在页面显示，但需入库供诊断使用：首次进入若库里没有，静默写入预设
      if (!p) {
        const { data: ins } = await supabase.from('health_profile').upsert({ user_id: uid, profile: DEFAULT_PROFILE }).select().single()
        p = ins
      }
      if (p) setProfile(p.profile || {})
      const { data: h } = await supabase.from('health_reports').select('*').eq('user_id', uid).order('week_start', { ascending: false }).limit(20)
      setHistory(h || [])
      if (h && h.length) setReport(h[0].result)
    } catch (e) { console.error(e) }
  }

  async function generate() {
    setGenerating(true); setMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user.id
      const days = []
      for (let i = 6; i >= 0; i--) days.push(shiftDate(todayStr(), -i))
      const { data: diet } = await supabase.from('diet').select('*').eq('user_id', uid).in('date', days)
      const map = {}
      ;(diet || []).forEach(d => { map[d.date] = d })
      const diet7 = days.map(d => map[d] || { date: d })

      const res = await api.healthReport(diet7, profile)
      const result = res.result
      const dow = new Date().getDay()
      const ws = shiftDate(todayStr(), dow === 0 ? -6 : -(dow - 1))
      const we = shiftDate(ws, 6)
      const { data: rep } = await supabase.from('health_reports')
        .insert({ user_id: uid, week_start: ws, week_end: we, result })
        .select().single()
      setReport(result)
      setHistory(h => [rep, ...h])
      setMsg('✅ 本周诊断已生成')
    } catch (e) { setMsg('生成失败：' + e.message) }
    finally { setGenerating(false) }
  }

  function renderReport(r) {
    if (!r) return <div className="empty">还没有诊断报告，点上面按钮生成第一份 👆</div>
    const cal = r.calorie || {}
    const wt = r.weight || {}
    const vit = r.vitamin || {}
    return (
      <div className="report">
        <div className="score" style={{ borderColor: scoreColor(r.score) }}>
          <div className="num" style={{ color: scoreColor(r.score) }}>{r.score ?? '—'}</div>
          <div className="cap">本周健康分</div>
        </div>

        <div className="hgrid">
          <div className="hcell">
            <div className="ht">🔥 热量</div>
            <div className="hv">日均 {cal.avg ?? '—'} kcal</div>
            <div className="hn">{cal.status ? `状态：${cal.status}` : ''}{cal.note ? ' · ' + cal.note : ''}</div>
          </div>
          <div className="hcell">
            <div className="ht">⚖️ 体重/体脂</div>
            <div className="hv">{wt.trend ?? '—'}{wt.change != null ? ` (${wt.change > 0 ? '+' : ''}${wt.change}kg)` : ''}</div>
            <div className="hn">{wt.note || ''}</div>
          </div>
          <div className="hcell">
            <div className="ht">💊 维生素</div>
            <div className="hv">依从 {vit.rate ?? '—'}</div>
            <div className="hn">{vit.note || ''}{vit.missed && vit.missed.length ? ' · 漏：' + vit.missed.join('、') : ''}</div>
          </div>
        </div>

        {r.highlights && r.highlights.length > 0 && (
          <div className="rblock">
            <div className="rhead">📌 本周亮点 / 风险</div>
            {r.highlights.map((x, i) => <div key={i} className="ritem">• {x}</div>)}
          </div>
        )}

        {r.advice && r.advice.length > 0 && (
          <div className="rblock">
            <div className="rhead">✅ 下周建议</div>
            {r.advice.map((x, i) => <div key={i} className="ritem">{(i + 1) + '. ' + x}</div>)}
          </div>
        )}

        {r.summary && <div className="rsummary">{r.summary}</div>}
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar title="健康诊断" />

      <section className="card">
        <div className="top">
          <span className="lbl">📊 本周健康诊断</span>
          <button className="btn sm primary" disabled={generating} onClick={generate}>{generating ? '分析中…' : '生成本周诊断'}</button>
        </div>
        <div className="note">聚合最近 7 天饮食 + 你的健康档案，交给 AI 出一份周报。</div>
        {renderReport(report)}
      </section>

      {history.length > 1 && (
        <section className="card">
          <div className="top"><span className="lbl">📜 历史周报</span></div>
          <div className="hist">
            {history.slice(1).map(h => (
              <div key={h.id} className="hist-item" onClick={() => setReport(h.result)}>
                <span className="hs">{h.week_start} ~ {h.week_end}</span>
                <span className="hn">分 {h.result?.score ?? '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
