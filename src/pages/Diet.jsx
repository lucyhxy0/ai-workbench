import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth } from '../lib/date.js'
import { api } from '../lib/api.js'

const MEALS = [
  { f: 'breakfast', t: '🥣 早餐' },
  { f: 'lunch', t: '🍚 午餐' },
  { f: 'dinner', t: '🍲 晚餐' },
  { f: 'afternoon_tea', t: '🍰 下午茶' },
  { f: 'drinks', t: '🥤 饮品' }
]
const VITAMINS = [
  { f: 'vitamin_d', t: '维生素 D' },
  { f: 'inositol', t: '肌醇' }
]

export default function Diet() {
  const today = todayStr()
  const [diet, setDiet] = useState(null)
  const [history, setHistory] = useState([])
  const [briefing, setBriefing] = useState(null)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState({
    breakfast: false, lunch: false, dinner: false, afternoon_tea: false, drinks: false
  })
  const [estimating, setEstimating] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    let { data: d } = await supabase.from('diet').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single(); d = nd }
    setDiet(d)

    const { data: b } = await supabase.from('briefings').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    setBriefing(b)

    const { data: h } = await supabase.from('diet').select('date,breakfast,lunch,dinner,afternoon_tea,drinks,vitamin_d,vitamin_d_am,vitamin_d_pm,inositol,inositol_am,inositol_pm').eq('user_id', uid).order('date', { ascending: false }).limit(10)
    setHistory(h || [])
  }

  useEffect(() => { load() }, [])

  async function save(field, value) {
    if (!diet) return
    setDiet({ ...diet, [field]: value })
    await supabase.from('diet').update({ [field]: value }).eq('id', diet.id)
  }

  const cal = f => (diet?.calories?.[f]) ?? ''
  async function saveKcal(field, val) {
    if (!diet) return
    const n = val === '' ? null : Number(val)
    const cur = (diet.calories && typeof diet.calories === 'object') ? diet.calories : {}
    const next = { ...cur, [field]: n }
    setDiet({ ...diet, calories: next })
    await supabase.from('diet').update({ calories: next }).eq('id', diet.id)
  }

  const totalKcal = MEALS.reduce((s, m) => s + (Number(cal(m.f)) || 0), 0)

  async function estimate() {
    if (!diet) return
    if (estimating) return
    const anyFilled = MEALS.some(m => (diet[m.f] || '').trim())
    if (!anyFilled) { setMsg('先在各餐框写吃了啥，再点估算～'); setTimeout(() => setMsg(''), 2500); return }
    setEstimating(true)
    try {
      const meals = {}
      for (const m of MEALS) meals[m.f] = diet[m.f] || ''
      const r = await api.caloriesEstimate(meals)
      for (const m of MEALS) {
        const v = r.calories?.[m.f]
        if (v != null && (diet[m.f] || '').trim()) await saveKcal(m.f, String(v))
      }
      setMsg('AI 估算完成 ✓')
    } catch (e) {
      setMsg('估算失败：' + e.message)
    } finally {
      setEstimating(false)
      setTimeout(() => setMsg(''), 2500)
    }
  }

  if (!diet) return <div className="empty">加载中…</div>

  return (
    <>
      <TopBar title="饮食" right={<span className="tag">{weekOfMonth()}周</span>} />
      <div className="page theme-diet">
        <div className="card washi tint">
          <h3>🍱 {today} 饮食</h3>
          {MEALS.map(m => (
            <div className="meal" key={m.f}>
              <div className="mhead">
                <span className="mt">{m.t}</span>
                <div className="mactions">
                  {editing[m.f]
                    ? <button className="btn" onClick={() => { setEditing(e => ({ ...e, [m.f]: false })); if ((diet[m.f] || '').trim()) estimate() }}>确认</button>
                    : <button className="btn ghost" onClick={() => setEditing(e => ({ ...e, [m.f]: true }))}>修改</button>}
                </div>
              </div>
              {editing[m.f]
                ? <textarea value={diet[m.f] || ''} onChange={e => save(m.f, e.target.value)} placeholder="计划 / 实际吃了什么" />
                : <div className={`locked ${(diet[m.f] || '') ? '' : 'empty'}`}>{diet[m.f] || '未填写'}</div>}
            </div>
          ))}
        </div>

        <div className="card tint">
          <h3>💊 维生素打卡</h3>
          {VITAMINS.map(v => (
            <div key={v.f} className="check-row">
              <span className={`checkbox ${diet[v.f] ? 'on' : ''}`} onClick={() => save(v.f, !diet[v.f])}>{diet[v.f] ? '✓' : ''}</span>
              <span className="label">{v.t}</span>
              <span className="sub">{diet[v.f] ? '已吃' : '未吃'}</span>
            </div>
          ))}
        </div>

        <div className="card tint">
          <h3>🔥 今日卡路里计算</h3>
          <div className="kcal-total">
            <span className="num">{totalKcal}</span>
            <span className="unit">千卡</span>
          </div>
          <div className="kcal-bars">
            {MEALS.map(m => (
              <div className="kbar" key={m.f}>
                <span className="kl">{m.t.split(' ')[1]}</span>
                <div className="kbar-track"><i style={{ width: (Number(cal(m.f)) || 0) / Math.max(totalKcal, 1) * 100 + '%' }} /></div>
                <span className="kv">{Number(cal(m.f)) || 0}</span>
              </div>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} disabled={estimating} onClick={estimate}>{estimating ? '自动计算中…' : '✨ 自动计算全部卡路里'}</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>

        <div className="card tint">
          <h3>📜 近期记录</h3>
          {history.length === 0 && <p className="sub">暂无</p>}
          {history.map(h => (
            <div key={h.date} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="label" style={{ fontSize: 13 }}>{h.date}</span>
              <span className="sub">
                {[(h.vitamin_d_am || h.vitamin_d_pm || h.vitamin_d) && 'D', (h.inositol_am || h.inositol_pm || h.inositol) && '肌醇'].filter(Boolean).join('+') || '—'}
                {(h.breakfast || h.lunch || h.dinner || h.afternoon_tea || h.drinks) ? ' 🍽' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
