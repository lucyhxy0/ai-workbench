import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth, shiftDate } from '../lib/date.js'
import { api } from '../lib/api.js'

function dayKcal(r) {
  const c = r.calories || {}
  return (Number(c.breakfast) || 0) + (Number(c.lunch) || 0) + (Number(c.dinner) || 0) + (Number(c.afternoon_tea) || 0) + (Number(c.drinks) || 0)
}

// 本周卡路里趋势（缩短）
function WeeklyChart({ rows }) {
  const last7 = [...(rows || [])].reverse().slice(-7)
  const vals = last7.map(dayKcal)
  const W = 300, H = 110, padX = 26, padY = 14
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
          <text x={p[0]} y={H - 3} fontSize="8" textAnchor="middle" fill="var(--text)">{String(p[3]).slice(5)}</text>
        </g>
      ))}
    </svg>
  )
}

// 体重 / 体脂趋势（扁曲线）
function WeightChart({ rows }) {
  const data = [...(rows || [])].reverse().filter(r => r.weight != null || r.body_fat != null).slice(-14)
  if (data.length < 2) return <p className="sub">记录 2 天以上显示体重 / 体脂曲线</p>
  const W = 300, H = 92, padX = 26, padY = 12
  const ws = data.map(r => Number(r.weight)).filter(v => !isNaN(v))
  const fs = data.map(r => Number(r.body_fat)).filter(v => !isNaN(v))
  const wmax = Math.max(...ws, 1), wmin = Math.min(...ws, 0)
  const fmax = Math.max(...fs, 1), fmin = Math.min(...fs, 0)
  const n = data.length
  const xs = i => padX + (W - padX * 2) * (n === 1 ? 0.5 : i / (n - 1))
  const wy = v => H - padY - ((v - wmin) / ((wmax - wmin) || 1)) * (H - padY * 2)
  const fy = v => H - padY - ((v - fmin) / ((fmax - fmin) || 1)) * (H - padY * 2)
  const wpts = data.map((r, i) => r.weight != null ? [xs(i), wy(Number(r.weight)), String(r.date).slice(5)] : null).filter(Boolean)
  const fpts = data.map((r, i) => r.body_fat != null ? [xs(i), fy(Number(r.body_fat)), String(r.date).slice(5)] : null).filter(Boolean)
  const wpath = wpts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const fpath = fpts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="var(--border)" />
      {fpts.length > 1 && <path d={fpath} fill="none" stroke="#C9B6E4" strokeWidth="2" strokeDasharray="4 3" />}
      {wpts.length > 1 && <path d={wpath} fill="none" stroke="#f8a97b" strokeWidth="2" />}
      {wpts.map((p, i) => <circle key={'w' + i} cx={p[0]} cy={p[1]} r="2.5" fill="#f8a97b" />)}
      {fpts.map((p, i) => <circle key={'f' + i} cx={p[0]} cy={p[1]} r="2.5" fill="#C9B6E4" />)}
      <text x={padX} y={H - 1} fontSize="9" fill="#f8a97b">体重</text>
      {fpts.length > 0 && <text x={W - padX} y={H - 1} textAnchor="end" fontSize="9" fill="#C9B6E4">体脂</text>}
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
  { f: 'vitamin_d', t: '维生素 D', am: 'vitamin_d_am', pm: 'vitamin_d_pm' },
  { f: 'vitamin_b', t: '维生素 B', am: 'vitamin_b_am', pm: 'vitamin_b_pm' },
  { f: 'inositol', t: '肌醇', am: 'inositol_am', pm: 'inositol_pm' }
]

export default function Diet() {
  const today = todayStr()
  const [viewDate, setViewDate] = useState(today)
  const [diet, setDiet] = useState(null)
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState({
    breakfast: false, lunch: false, dinner: false, afternoon_tea: false, drinks: false
  })
  const [estimating, setEstimating] = useState(false)
  const [msg, setMsg] = useState('')

  async function load(date = viewDate) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id
    let { data: d } = await supabase.from('diet').select('*').eq('user_id', uid).eq('date', date).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date }).select().single(); d = nd }
    setDiet(d)
    const { data: h } = await supabase.from('diet').select('date,breakfast,lunch,dinner,afternoon_tea,drinks,calories,vitamin_d_am,vitamin_d_pm,vitamin_b_am,vitamin_b_pm,inositol_am,inositol_pm,note,weight,body_fat').eq('user_id', uid).order('date', { ascending: false }).limit(14)
    setHistory(h || [])
  }

  useEffect(() => { load(viewDate) }, [viewDate])

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

  const vd = new Date(viewDate + 'T00:00:00')

  return (
    <>
      <TopBar title="饮食" right={<span className="tag">{weekOfMonth(vd)}周</span>} />
      <div className="page theme-diet">

        {/* 餐 + 日期导航 */}
        <div className="card washi tint">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" style={{ width: 'auto' }} onClick={() => setViewDate(s => shiftDate(s, -1))}>← 前一天</button>
            <span>{viewDate} 饮食</span>
            {viewDate !== today && <button className="btn ghost sm" style={{ width: 'auto' }} onClick={() => setViewDate(today)}>今天</button>}
          </h3>
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

        {/* 维生素打卡 */}
        <div className="card tint">
          <h3>💊 维生素打卡</h3>
          {VITAMINS.map(v => (
            <div className="check-row" key={v.f}>
              <span className="vbox">
                <span className={`checkbox sm ${diet[v.am] ? 'on' : ''}`} onClick={() => save(v.am, !diet[v.am])}>{diet[v.am] ? '✓' : '早'}</span>
                <span className={`checkbox sm ${diet[v.pm] ? 'on' : ''}`} onClick={() => save(v.pm, !diet[v.pm])}>{diet[v.pm] ? '✓' : '晚'}</span>
              </span>
              <span className="label">{v.t}</span>
              <span className="sub">{diet[v.am] || diet[v.pm] ? '已吃' : '未吃'}</span>
            </div>
          ))}
        </div>

        {/* 今日卡路里计算 */}
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
          <button className="btn ghost sm" style={{ marginTop: 10, width: 'auto' }} disabled={estimating} onClick={estimate}>{estimating ? '自动计算中…' : '✨ 自动计算全部卡路里'}</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>

        {/* 卡路里趋势（计算下方） */}
        <div className="card washi tint">
          <h3>📈 本周卡路里趋势</h3>
          <WeeklyChart rows={history} />
        </div>

        {/* 身体状况（一直显示） */}
        <div className="card tint">
          <h3>🩺 身体状况</h3>
          <div className="body-show">
            <div className="bv"><span className="num">{diet.weight ?? '—'}</span><span className="u">kg</span><div className="bl">体重</div></div>
            <div className="bv"><span className="num">{diet.body_fat ?? '—'}</span><span className="u">%</span><div className="bl">体脂率</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ marginTop: 0, minWidth: 72 }}>体重 (kg)</label>
              <input type="number" inputMode="decimal" min="0" value={diet.weight ?? ''}
                onChange={e => setDiet({ ...diet, weight: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" style={{ marginTop: 0 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ marginTop: 0, minWidth: 72 }}>体脂率 (%)</label>
              <input type="number" inputMode="decimal" min="0" value={diet.body_fat ?? ''}
                onChange={e => setDiet({ ...diet, body_fat: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0" style={{ marginTop: 0 }} />
            </div>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={async () => { await save('weight', diet.weight); await save('body_fat', diet.body_fat); setMsg('身体状况已保存 ✓'); setTimeout(() => setMsg(''), 1500) }}>确认</button>
        </div>

        {/* 体重 / 体脂趋势（扁曲线） */}
        <div className="card tint">
          <h3>📉 体重 / 体脂趋势</h3>
          <WeightChart rows={history} />
        </div>

        {/* 备注（最底部） */}
        <div className="card washi tint">
          <h3>📝 备注</h3>
          <textarea value={diet.note || ''} onChange={e => setDiet({ ...diet, note: e.target.value })} placeholder="今天想记的小事 / 心情 / 备注" style={{ minHeight: 54 }} />
          <button className="btn" style={{ marginTop: 8 }} onClick={() => save('note', diet.note || '')}>确认</button>
        </div>

      </div>
    </>
  )
}
