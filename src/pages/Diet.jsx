import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth } from '../lib/date.js'
import { api } from '../lib/api.js'

function dayKcal(r) {
  const c = r.calories || {}
  return (Number(c.breakfast) || 0) + (Number(c.lunch) || 0) + (Number(c.dinner) || 0) + (Number(c.afternoon_tea) || 0) + (Number(c.drinks) || 0)
}
function WeeklyChart({ rows }) {
  const last7 = [...(rows || [])].reverse().slice(-7)
  const vals = last7.map(dayKcal)
  const W = 320, H = 140, padX = 30, padY = 22
  const max = Math.max(...vals, 100)
  const n = vals.length
  if (n === 0) return <p className="sub">暂无数据</p>
  const xs = i => padX + (W - padX * 2) * (n === 1 ? 0.5 : i / (n - 1))
  const ys = v => H - padY - (v / max) * (H - padY * 2)
  const pts = vals.map((v, i) => [xs(i), ys(v), v, last7[i].date])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="var(--border)" />
      <path d={path} fill="none" stroke="#ff8a5b" strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3" fill="#ff8a5b" />
          <text x={p[0]} y={p[1] - 6} fontSize="9" textAnchor="middle" fill="var(--text)">{p[2] || ''}</text>
          <text x={p[0]} y={H - 6} fontSize="8" textAnchor="middle" fill="var(--text)">{String(p[3]).slice(5)}</text>
        </g>
      ))}
    </svg>
  )
}

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

    const { data: h } = await supabase.from('diet').select('date,breakfast,lunch,dinner,afternoon_tea,drinks,calories,vitamin_d,vitamin_d_am,vitamin_d_pm,inositol,inositol_am,inositol_pm,note,weight,body_fat').eq('user_id', uid).order('date', { ascending: false }).limit(14)
    setHistory(h || [])
  }

  useEffect(() => { load() }, [])

  async function save(field, value) {
    if (!diet) return
    setDiet({ ...diet, [field]: value })
    await supabase.from('diet').update({ [field]: value }).eq('id', diet.id)
  }

  const cal = f => (diet?.calories?.[f]) ?? ''
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
      // 一次性累积所有餐，只写一次，避免循环里后者覆盖前者
      const next = (diet.calories && typeof diet.calories === 'object') ? { ...diet.calories } : {}
      for (const m of MEALS) {
        const v = r.calories?.[m.f]
        if (v != null && (diet[m.f] || '').trim()) next[m.f] = Number(v)
      }
      setDiet({ ...diet, calories: next })
      await supabase.from('diet').update({ calories: next }).eq('id', diet.id)
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

        <div className="card washi tint">
          <h3>📝 备注</h3>
          <textarea value={diet.note || ''} onChange={e => setDiet({ ...diet, note: e.target.value })} placeholder="今天想记的小事 / 心情 / 备注" style={{ minHeight: 54 }} />
          <button className="btn" style={{ marginTop: 8 }} onClick={() => save('note', diet.note || '')}>确认</button>
        </div>

        <div className="card tint">
          <h3>📈 本周卡路里趋势</h3>
          <WeeklyChart rows={history} />
        </div>

        <div className="card tint">
          <h3>🩺 身体状况</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <label style={{ fontSize: 13, minWidth: 86 }}>体重 (kg)</label>
            <input type="number" inputMode="decimal" min="0" value={diet.weight ?? ''}
              onChange={e => setDiet({ ...diet, weight: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <label style={{ fontSize: 13, minWidth: 86 }}>体脂率 (%)</label>
            <input type="number" inputMode="decimal" min="0" value={diet.body_fat ?? ''}
              onChange={e => setDiet({ ...diet, body_fat: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={async () => { await save('weight', diet.weight); await save('body_fat', diet.body_fat); setMsg('身体状况已保存 ✓'); setTimeout(() => setMsg(''), 1500) }}>确认</button>
        </div>
      </div>
    </>
  )
}
