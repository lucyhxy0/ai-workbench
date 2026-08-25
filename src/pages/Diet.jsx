import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth } from '../lib/date.js'

function mondayOf(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return todayStr(d)
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
  const [weekReview, setWeekReview] = useState('')
  const [history, setHistory] = useState([])
  const [briefing, setBriefing] = useState(null)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState({
    breakfast: true, lunch: true, dinner: true, afternoon_tea: true, drinks: true
  })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    let { data: d } = await supabase.from('diet').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single(); d = nd }
    setDiet(d)

    const { data: wr } = await supabase.from('diet').select('weekly_review').eq('user_id', uid).eq('date', mondayOf()).maybeSingle()
    setWeekReview(wr?.weekly_review || '')

    const { data: b } = await supabase.from('briefings').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    setBriefing(b)

    const { data: h } = await supabase.from('diet').select('date,breakfast,lunch,dinner,afternoon_tea,drinks,vitamin_d,inositol').eq('user_id', uid).order('date', { ascending: false }).limit(10)
    setHistory(h || [])
  }

  useEffect(() => { load() }, [])

  async function save(field, value) {
    if (!diet) return
    setDiet({ ...diet, [field]: value })
    await supabase.from('diet').update({ [field]: value }).eq('id', diet.id)
  }

  async function saveWeekReview() {
    const { data: { user } } = await supabase.auth.getUser()
    const m = mondayOf()
    let { data: d } = await supabase.from('diet').select('*').eq('user_id', user.id).eq('date', m).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('diet').insert({ user_id: user.id, date: m }).select().single(); d = nd }
    await supabase.from('diet').update({ weekly_review: weekReview }).eq('id', d.id)
    setMsg('周复盘已保存 ✓')
    setTimeout(() => setMsg(''), 2000)
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
                    ? <button className="btn" onClick={() => setEditing(e => ({ ...e, [m.f]: false }))}>确认</button>
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
          <h3>📝 本周饮食复盘（{mondayOf()} 起）</h3>
          <textarea value={weekReview} onChange={e => setWeekReview(e.target.value)} placeholder="总结本周饮食规律、营养摄入、改进方向…" />
          <button className="btn" style={{ marginTop: 10 }} onClick={saveWeekReview}>保存周复盘</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>

        <div className="card tint">
          <h3>📜 近期记录</h3>
          {history.length === 0 && <p className="sub">暂无</p>}
          {history.map(h => (
            <div key={h.date} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="label" style={{ fontSize: 13 }}>{h.date}</span>
              <span className="sub">
                {[h.vitamin_d && 'D', h.inositol && '肌醇'].filter(Boolean).join('+') || '—'}
                {(h.breakfast || h.lunch || h.dinner || h.afternoon_tea || h.drinks) ? ' 🍽' : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Lucy AI 今日建议（最下方） */}
        <div className="ai-card" style={{ marginBottom: 14 }}>
          <div className="bot">🤖</div>
          <div className="txt">
            <b>Lucy AI 今日建议</b><br />
            {briefing?.summary || '早上好～在「今日」页生成晨报后，我会结合你的盘面与作息，给你今天的饮食与作息建议。'}
          </div>
        </div>
      </div>
    </>
  )
}
