import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, monthMatrix } from '../lib/date.js'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [sel, setSel] = useState(todayStr())
  const [events, setEvents] = useState([])
  const [allEvents, setAllEvents] = useState({})
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [time, setTime] = useState('')
  const [importance, setImportance] = useState(1)
  const [editing, setEditing] = useState(null)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const next = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, '0')}-01`
    const { data } = await supabase.from('calendar_events').select('*').eq('user_id', user.id).gte('event_date', from).lt('event_date', next)
    const map = {}
    ;(data || []).forEach(e => { (map[e.event_date] ||= []).push(e) })
    setAllEvents(map)
    await loadDay(sel)
  }

  async function loadDay(date) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('calendar_events').select('*').eq('user_id', user.id).eq('event_date', date)
    setEvents(data || [])
  }

  useEffect(() => { load() }, [year, month])

  function pick(d) {
    if (!d) return
    const s = todayStr(d)
    setSel(s); loadDay(s)
  }

  function prev() { const m = month - 1; if (m < 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m) }
  function next() { const m = month + 1; if (m > 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m) }

  async function add() {
    if (!title.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { user_id: user.id, event_date: sel, title: title.trim(), note: note.trim(), importance, event_time: time || null }
    if (editing) {
      await supabase.from('calendar_events').update(payload).eq('id', editing)
    } else {
      await supabase.from('calendar_events').insert(payload)
    }
    setTitle(''); setNote(''); setTime(''); setImportance(1); setEditing(null); await load()
  }

  async function del(id) {
    await supabase.from('calendar_events').delete().eq('id', id); await load()
  }

  function startEdit(e) {
    setEditing(e.id); setTitle(e.title); setNote(e.note || ''); setTime(e.event_time || ''); setImportance(e.importance)
  }

  // 时间轴：按时间排序（无时间的排在最后）
  const timeline = [...events].sort((a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99'))
  const cells = monthMatrix(year, month)

  return (
    <>
      <TopBar title="日历" />
      <div className="page theme-cal">
        {/* 日计划时间轴 */}
        <div className="card washi tint">
          <h3>🗓 {sel} 日计划</h3>
          {timeline.length === 0 && <p className="sub">当天暂无安排，下面添加一条吧～</p>}
          <div className="timeline">
            {timeline.map(e => (
              <div key={e.id} className="tl-item">
                <span className="tl-dot" style={{ background: e.importance >= 3 ? 'var(--coral)' : e.importance === 2 ? 'var(--lemon)' : 'var(--primary)' }} />
                <span className="tl-time">{e.event_time || ''}</span>
                <div className="tl-body">
                  <div className="t">{e.title}</div>
                  {e.note && <div className="n">{e.note}</div>}
                </div>
                <span className="tl-del" onClick={() => del(e.id)}>删</span>
                <span className="tl-del" style={{ marginLeft: 8 }} onClick={() => startEdit(e)}>改</span>
              </div>
            ))}
          </div>
        </div>

        {/* 月历 */}
        <div className="card tint">
          <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
            <button className="btn ghost sm" onClick={prev}>‹</button>
            <span style={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>{year} 年 {month + 1} 月</span>
            <button className="btn ghost sm" onClick={next}>›</button>
          </div>
          <div className="cal-grid" style={{ marginBottom: 6 }}>
            {WEEK.map(w => <div key={w} className="muted center" style={{ fontSize: 12 }}>{w}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const s = todayStr(d)
              const evs = allEvents[s] || []
              const hasWarn = evs.some(e => e.importance >= 2)
              return (
                <div key={s} className={`cal-cell ${s === sel ? 'sel' : ''} ${s === todayStr() ? 'today' : ''}`} onClick={() => pick(d)}>
                  <span>{d.getDate()}</span>
                  {evs.length > 0 && <span className={`ev ${hasWarn ? 'warn' : ''}`} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* 添加 / 编辑事件 */}
        <div className="card tint">
          <h3>{editing ? '✏️ 修改事件' : '➕ 添加日计划'}</h3>
          <label>时间（可选）</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          <label>标题</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：9:00 吃药、朋友生日、体检" />
          <label>备注</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" />
          <label>重要程度</label>
          <select value={importance} onChange={e => setImportance(Number(e.target.value))}>
            <option value={1}>普通</option>
            <option value={2}>重要</option>
            <option value={3}>紧急</option>
          </select>
          <button className="btn" style={{ marginTop: 10 }} onClick={add}>{editing ? '保存修改' : '添加到日计划'}</button>
          {editing && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setEditing(null); setTitle(''); setNote(''); setTime(''); setImportance(1) }}>取消</button>}
        </div>
      </div>
    </>
  )
}
