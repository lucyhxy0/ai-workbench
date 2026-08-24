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
    const { data } = await supabase.from('calendar_events').select('*').eq('user_id', user.id).eq('event_date', date).order('importance', { ascending: false })
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
    await supabase.from('calendar_events').insert({ user_id: user.id, event_date: sel, title: title.trim(), note: note.trim(), importance })
    setTitle(''); setNote(''); setImportance(1); await load(); await loadDay(sel)
  }

  async function del(id) {
    await supabase.from('calendar_events').delete().eq('id', id); await load(); await loadDay(sel)
  }

  const cells = monthMatrix(year, month)

  return (
    <>
      <TopBar title="日历" />
      <div className="page theme-cal">
        <div className="card washi tint">
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

        <div className="card tint">
          <h3>📌 {sel} 事件</h3>
          {events.map(e => (
            <div key={e.id} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="dot" style={{ background: e.importance >= 3 ? 'var(--danger)' : e.importance === 2 ? 'var(--warn)' : 'var(--primary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{e.title}</div>
                {e.note && <div className="sub">{e.note}</div>}
              </div>
              <button className="btn danger sm" onClick={() => del(e.id)}>删</button>
            </div>
          ))}
          {events.length === 0 && <p className="sub">当天暂无事件</p>}
        </div>

        <div className="card tint">
          <h3>➕ 添加事件</h3>
          <label>标题</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：朋友生日、旅行、体检" />
          <label>备注</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" />
          <label>重要程度</label>
          <select value={importance} onChange={e => setImportance(Number(e.target.value))}>
            <option value={1}>普通</option>
            <option value={2}>重要</option>
            <option value={3}>紧急</option>
          </select>
          <button className="btn" style={{ marginTop: 10 }} onClick={add}>添加</button>
        </div>
      </div>
    </>
  )
}
