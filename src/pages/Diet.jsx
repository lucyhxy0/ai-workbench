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

export default function Diet() {
  const today = todayStr()
  const [diet, setDiet] = useState(null)
  const [weekReview, setWeekReview] = useState('')
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    let { data: d } = await supabase.from('diet').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single(); d = nd }
    setDiet(d)

    const { data: wr } = await supabase.from('diet').select('weekly_review').eq('user_id', uid).eq('date', mondayOf()).maybeSingle()
    setWeekReview(wr?.weekly_review || '')

    const { data: h } = await supabase.from('diet').select('date,breakfast,lunch,dinner,vitamin_a,vitamin_b').eq('user_id', uid).order('date', { ascending: false }).limit(10)
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
      <div className="page">
        <div className="card">
          <h3>🍱 {today} 三餐</h3>
          <label>早餐</label>
          <textarea value={diet.breakfast} onChange={e => save('breakfast', e.target.value)} placeholder="计划/实际吃了什么" />
          <label>午餐</label>
          <textarea value={diet.lunch} onChange={e => save('lunch', e.target.value)} placeholder="计划/实际吃了什么" />
          <label>晚餐</label>
          <textarea value={diet.dinner} onChange={e => save('dinner', e.target.value)} placeholder="计划/实际吃了什么" />
        </div>

        <div className="card">
          <h3>💊 维生素打卡</h3>
          {['vitamin_a', 'vitamin_b'].map((col, i) => (
            <div key={col} className="check-row">
              <span className={`checkbox ${diet[col] ? 'on' : ''}`} onClick={() => save(col, !diet[col])}>{diet[col] ? '✓' : ''}</span>
              <span className="label">维生素 {String.fromCharCode(65 + i)}</span>
              <span className="sub">{diet[col] ? '已吃' : '未吃'}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>📝 本周饮食复盘（{mondayOf()} 起）</h3>
          <textarea value={weekReview} onChange={e => setWeekReview(e.target.value)} placeholder="总结本周饮食规律、营养摄入、改进方向…" />
          <button className="btn" style={{ marginTop: 10 }} onClick={saveWeekReview}>保存周复盘</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>

        <div className="card">
          <h3>📜 近期记录</h3>
          {history.length === 0 && <p className="sub">暂无</p>}
          {history.map(h => (
            <div key={h.date} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="label" style={{ fontSize: 13 }}>{h.date}</span>
              <span className="sub">
                {[h.vitamin_a && 'A', h.vitamin_b && 'B'].filter(Boolean).join('+') || '—'}
                {h.breakfast || h.lunch || h.dinner ? ' 🍽' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
