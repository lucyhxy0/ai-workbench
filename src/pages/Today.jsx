import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr } from '../lib/date.js'
import { api } from '../lib/api.js'

export default function Today() {
  const nav = useNavigate()
  const today = todayStr()
  const [briefing, setBriefing] = useState(null)
  const [diet, setDiet] = useState(null)
  const [events, setEvents] = useState([])
  const [dueTasks, setDueTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [genBusy, setGenBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    const [{ data: b }, { data: d }, { data: ev }, { data: mt }] = await Promise.all([
      supabase.from('briefings').select('*').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('diet').select('*').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('calendar_events').select('*').eq('user_id', uid).eq('event_date', today).order('importance', { ascending: false }),
      supabase.from('monthly_tasks').select('*').eq('user_id', uid).eq('day_of_month', new Date().getDate()).eq('active', true)
    ])

    setBriefing(b)
    setEvents(ev || [])
    setDueTasks(mt || [])

    if (d) setDiet(d)
    else {
      const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single()
      setDiet(nd)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleVitamin(col) {
    if (!diet) return
    const next = { ...diet, [col]: !diet[col] }
    setDiet(next)
    await supabase.from('diet').update({ [col]: next[col] }).eq('id', diet.id)
  }

  async function generateBriefing() {
    setGenBusy(true)
    try {
      const result = await api.generateBriefing(today)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: saved } = await supabase.from('briefings').upsert(
        { user_id: user.id, date: today, us_market: result.us_market, economy: result.economy, domestic: result.domestic, summary: result.summary },
        { onConflict: 'user_id,date' }
      ).select().single()
      setBriefing(saved)
    } catch (e) {
      alert('生成失败：' + e.message)
    } finally {
      setGenBusy(false)
    }
  }

  if (loading) return <div className="empty">加载中…</div>

  return (
    <>
      <TopBar title="今日" />
      <div className="page">
        {/* 晨报 */}
        <div className="card">
          <h3>🌅 晨报</h3>
          {briefing ? (
            <div>
              <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{briefing.summary || '（暂无摘要）'}</p>
              <button className="btn ghost sm" onClick={() => setShowDetail(s => !s)}>{showDetail ? '收起' : '查看明细'}</button>
              {showDetail && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <p><b>🇺🇸 美股夜盘</b><br />{briefing.us_market || '—'}</p>
                  <p><b>📊 经济重要信息</b><br />{briefing.economy || '—'}</p>
                  <p><b>🇨🇳 国内重大事项</b><br />{briefing.domestic || '—'}</p>
                </div>
              )}
            </div>
          ) : (
            <button className="btn" disabled={genBusy} onClick={generateBriefing}>{genBusy ? '生成中…' : '生成今日晨报'}</button>
          )}
        </div>

        {/* 饮食 */}
        <div className="card">
          <h3>🍱 今日饮食</h3>
          <div className="check-row">
            <span className="checkbox" onClick={() => toggleVitamin('vitamin_a')}>{diet?.vitamin_a ? '✓' : ''}</span>
            <span className="label">维生素 A</span>
          </div>
          <div className="check-row">
            <span className="checkbox" onClick={() => toggleVitamin('vitamin_b')}>{diet?.vitamin_b ? '✓' : ''}</span>
            <span className="label">维生素 B</span>
          </div>
          <button className="btn ghost sm" onClick={() => nav('/diet')}>记录三餐</button>
        </div>

        {/* 操盘 */}
        <div className="card">
          <h3>📈 操盘</h3>
          <p className="sub">晚上记得复盘今日操作</p>
          <button className="btn ghost sm" onClick={() => nav('/trading')}>记录 / 复盘</button>
        </div>

        {/* 待办：月度事务 */}
        {dueTasks.length > 0 && (
          <div className="card">
            <h3>⚠️ 今日待办</h3>
            {dueTasks.map(t => (
              <div key={t.id} className="check-row">
                <span className="dot" style={{ background: 'var(--warn)' }} />
                <span className="label">{t.name}{t.note ? ` · ${t.note}` : ''}</span>
                <span className="tag">{t.category}</span>
              </div>
            ))}
          </div>
        )}

        {/* 日历事件 */}
        {events.length > 0 && (
          <div className="card">
            <h3>📆 今日事件</h3>
            {events.map(e => (
              <div key={e.id} className="check-row">
                <span className="dot" style={{ background: e.importance >= 3 ? 'var(--danger)' : e.importance === 2 ? 'var(--warn)' : 'var(--primary)' }} />
                <span className="label">{e.title}</span>
              </div>
            ))}
          </div>
        )}

        <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>
          数据存于 Supabase，可同步至 Notion（设置中配置）
        </p>
      </div>
    </>
  )
}
