import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, prettyDate } from '../lib/date.js'
import { api } from '../lib/api.js'

export default function Today() {
  const nav = useNavigate()
  const today = todayStr()
  const [briefing, setBriefing] = useState(null)
  const [diet, setDiet] = useState(null)
  const [trading, setTrading] = useState(null)
  const [events, setEvents] = useState([])
  const [dueTasks, setDueTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [genBusy, setGenBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id

    const [{ data: b }, { data: d }, { data: tr }, { data: ev }, { data: mt }] = await Promise.all([
      supabase.from('briefings').select('*').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('diet').select('*').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('trading').select('*').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('calendar_events').select('*').eq('user_id', uid).eq('event_date', today).order('importance', { ascending: false }),
      supabase.from('monthly_tasks').select('*').eq('user_id', uid).eq('day_of_month', new Date().getDate()).eq('active', true)
    ])

    setBriefing(b)
    setEvents(ev || [])
    setDueTasks(mt || [])

    if (d) setDiet(d)
    else { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single(); setDiet(nd) }
    setTrading(tr)
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

  const vitCount = diet ? (diet.vitamin_a ? 1 : 0) + (diet.vitamin_b ? 1 : 0) : 0
  const reviewDone = !!(trading && (trading.review || trading.operations))
  const checkItems = [
    { key: 'a', label: '维A', on: diet?.vitamin_a, click: () => toggleVitamin('vitamin_a') },
    { key: 'b', label: '维B', on: diet?.vitamin_b, click: () => toggleVitamin('vitamin_b') },
    { key: 'diet', label: '饮食', on: !!diet, click: () => nav('/diet') },
    { key: 'trade', label: '复盘', on: reviewDone, click: () => nav('/trading') },
    { key: 'todo', label: '待办', on: dueTasks.length === 0, click: () => nav('/settings') }
  ]
  const checkDone = checkItems.filter(i => i.on).length

  if (loading) return <div className="empty">加载中…</div>

  return (
    <>
      <TopBar title="今日" />

      <div className="page">
        {/* 问候块 */}
        <div className="greeting">
          <div className="hi">Good Morning.</div>
          <div className="name">Lucy</div>
          <div className="date">{prettyDate()}</div>
          <div className="right">
            <div className="sticky mint" style={{ maxWidth: 120 }}>You got this! 💗</div>
          </div>
          <div className="pet">
            <div className="polaroid">
              <div className="ph">🐱</div>
              <div className="cap">my cat</div>
            </div>
          </div>
        </div>

        {/* 状态条 */}
        <div className="status-strip" style={{ marginBottom: 14 }}>
          <div className="status-card" style={{ background: 'var(--sky)' }}>
            <div className="k">🌅 晨报</div>
            <div className="v">{briefing ? '已生成' : '待生成'}</div>
            <div className="bar"><i style={{ width: briefing ? '100%' : '10%', ['--c']: 'var(--sky)' }} /></div>
          </div>
          <div className="status-card" style={{ background: 'var(--peach)' }}>
            <div className="k">💊 维生素</div>
            <div className="v">{vitCount}/2</div>
            <div className="bar"><i style={{ width: (vitCount / 2 * 100) + '%', ['--c']: 'var(--peach)' }} /></div>
          </div>
          <div className="status-card" style={{ background: 'var(--lemon)' }}>
            <div className="k">📈 操盘复盘</div>
            <div className="v">{reviewDone ? '已复盘' : '待复盘'}</div>
            <div className="bar"><i style={{ width: reviewDone ? '100%' : '10%', ['--c']: 'var(--lemon)' }} /></div>
          </div>
          <div className="status-card" style={{ background: 'var(--sage)' }}>
            <div className="k">📅 今日待办</div>
            <div className="v">{dueTasks.length} 项</div>
            <div className="bar"><i style={{ width: (dueTasks.length ? 60 : 100) + '%', ['--c']: 'var(--sage)' }} /></div>
          </div>
        </div>

        {/* 财经日报（报纸风） */}
        <div className="fin-daily washi" style={{ marginBottom: 14 }}>
          <div className="clip" />
          <div className="head">
            <div className="t">Lucy Finance Daily</div>
            <div className="d">{today} 更新</div>
          </div>
          {briefing ? (
            <>
              <div className="fin-cols">
                <div className="fin-col">
                  <h4>🇺🇸 美股夜盘</h4>
                  <p>{briefing.us_market || '—'}</p>
                </div>
                <div className="fin-col">
                  <h4>📊 经济要闻</h4>
                  <p>{briefing.economy || '—'}</p>
                </div>
                <div className="fin-col">
                  <h4>🇨🇳 国内大事</h4>
                  <p>{briefing.domestic || '—'}</p>
                </div>
              </div>
              <div className="sticky" style={{ marginTop: 10 }}>
                <b>AI 今日痛点：</b>{briefing.summary || '—'}
              </div>
              <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setShowDetail(s => !s)}>{showDetail ? '收起明细' : '查看完整晨报'}</button>
              {showDetail && (
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                  <p><b>美股：</b>{briefing.us_market}</p>
                  <p><b>经济：</b>{briefing.economy}</p>
                  <p><b>国内：</b>{briefing.domestic}</p>
                </div>
              )}
            </>
          ) : (
            <button className="btn" disabled={genBusy} onClick={generateBriefing}>{genBusy ? '生成中…' : '✨ 生成今日晨报'}</button>
          )}
        </div>

        {/* 每日打卡条 */}
        <div className="checkin" style={{ marginBottom: 14 }}>
          <div className="top">
            <span className="lbl">🌿 每日打卡</span>
            <span className="prog">{checkDone}/5 完成</span>
          </div>
          <div className="grid">
            {checkItems.map(it => (
              <div key={it.key} className="item" onClick={it.click}>
                <div className={`box ${it.on ? 'on' : ''}`}>{it.on ? '✓' : ''}</div>
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI 今日建议 */}
        <div className="ai-card" style={{ marginBottom: 14 }}>
          <div className="bot">🤖</div>
          <div className="txt">
            <b>Lucy AI 今日建议</b><br />
            {briefing?.summary || '早上好～点上方生成晨报，我就能结合美股与盘面给你今天的操盘与作息建议。'}
          </div>
        </div>

        {/* 操盘提醒 */}
        <div className="card tint theme-trade">
          <div className="mini-head"><span className="star">⭐️</span> 操盘</div>
          <p className="sub">晚上记得复盘今日操作～</p>
          <button className="btn ghost sm" onClick={() => nav('/trading')}>记录 / 复盘</button>
        </div>

        {/* 今日事件 */}
        {events.length > 0 && (
          <div className="card tint theme-cal">
            <div className="mini-head"><span className="star">⭐️</span> 今日事件</div>
            {events.map(e => (
              <div key={e.id} className="check-row">
                <span className="dot" style={{ background: e.importance >= 3 ? 'var(--coral)' : e.importance === 2 ? 'var(--lemon)' : 'var(--sky)' }} />
                <span className="label">{e.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* 月度待办 */}
        {dueTasks.length > 0 && (
          <div className="card tint theme-set">
            <div className="mini-head"><span className="star">⭐️</span> 今日待办</div>
            {dueTasks.map(t => (
              <div key={t.id} className="check-row">
                <span className="dot" style={{ background: 'var(--sage)' }} />
                <span className="label">{t.name}{t.note ? ` · ${t.note}` : ''}</span>
                <span className="tag">{t.category}</span>
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
