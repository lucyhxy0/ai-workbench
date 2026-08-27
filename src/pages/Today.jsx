import { useEffect, useState, useRef } from 'react'
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
  const [customItems, setCustomItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [genBusy, setGenBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [petPhoto, setPetPhoto] = useState('')
  const fileRef = useRef(null)

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
    setPetPhoto(localStorage.getItem('lucy_pet_' + uid) || '')

    const { data: ci } = await supabase.from('checkin_items').select('*').eq('user_id', uid).order('created_at')
    setCustomItems(ci || [])

    if (d) setDiet(d)
    else { const { data: nd } = await supabase.from('diet').insert({ user_id: uid, date: today }).select().single(); setDiet(nd) }
    setTrading(tr)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleVit(col) {
    if (!diet) return
    const next = { ...diet, [col]: !diet[col] }
    setDiet(next)
    await supabase.from('diet').update({ [col]: next[col] }).eq('id', diet.id)
  }

  function pickPhoto() { fileRef.current?.click() }
  async function onPhoto(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const { data: { user } } = await supabase.auth.getUser()
    const r = new FileReader()
    r.onload = () => {
      const d = r.result
      setPetPhoto(d)
      if (user) localStorage.setItem('lucy_pet_' + user.id, d)
    }
    r.readAsDataURL(f)
  }

  // 自定义打卡项（用户级，长期保留，不随日期重置）
  async function toggleCustom(id) {
    const item = customItems.find(c => c.id === id)
    if (!item) return
    const next = { ...item, done: !item.done }
    setCustomItems(ci => ci.map(c => c.id === id ? next : c))
    await supabase.from('checkin_items').update({ done: next.done }).eq('id', id)
  }
  async function addCustom() {
    const label = newLabel.trim()
    if (!label) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: row } = await supabase.from('checkin_items').insert({ user_id: user.id, label, done: false }).select().single()
    if (row) setCustomItems(ci => [...ci, row])
    setNewLabel(''); setAdding(false)
  }
  async function removeCustom(id) {
    setCustomItems(ci => ci.filter(c => c.id !== id))
    await supabase.from('checkin_items').delete().eq('id', id)
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

  const vitFields = [
    { key: 'vd', label: '维D', am: 'vitamin_d_am', pm: 'vitamin_d_pm' },
    { key: 'ino', label: '肌醇', am: 'inositol_am', pm: 'inositol_pm' }
  ]
  const vitCols = ['vitamin_d_am', 'vitamin_d_pm', 'inositol_am', 'inositol_pm']
  const vitCount = diet ? vitCols.filter(c => diet[c]).length : 0
  const reviewDone = !!(trading && (trading.review || trading.operations))
  const customMapped = customItems.map(c => ({
    key: c.id, label: c.label, on: c.done, custom: true, click: () => toggleCustom(c.id)
  }))
  const checkDone = customMapped.filter(i => i.on).length

  if (loading) return <div className="empty">加载中…</div>

  return (
    <>
      <TopBar title="今日" />

      <div className="page">
        {/* 问候块 */}
        <div className="greeting">
          <div className="hi">Good Morning.</div>
          <div className="name">Lucy</div>
          <div className="date">{prettyDate().split(' ')[0]}<br />{prettyDate().split(' ')[1]}</div>
          <div className="pet">
            <div className="polaroid" onClick={pickPhoto} title="点击更换照片">
              <div className="ph">{petPhoto ? <img src={petPhoto} alt="Tobey" /> : '🐱'}</div>
              <div className="cap">Tobey</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
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
            <div className="v">{vitCount}/4</div>
            <div className="bar"><i style={{ width: (vitCount / 4 * 100) + '%', ['--c']: 'var(--peach)' }} /></div>
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
            <span className="prog">{checkDone + vitCount}/{customMapped.length + vitCols.length} 完成</span>
          </div>
          <div className="grid">
            {vitFields.map(v => (
              <div key={v.key} className="item vit">
                <div className="vbox">
                  <div className={`box sm ${diet?.[v.am] ? 'on' : ''}`} onClick={() => toggleVit(v.am)}>{diet?.[v.am] ? '✓' : '早'}</div>
                  <div className={`box sm ${diet?.[v.pm] ? 'on' : ''}`} onClick={() => toggleVit(v.pm)}>{diet?.[v.pm] ? '✓' : '晚'}</div>
                </div>
                <span>{v.label}</span>
              </div>
            ))}
            {customMapped.map(it => (
              <div key={it.key} className="item" onClick={it.click}>
                <div className={`box ${it.on ? 'on' : ''}`}>{it.on ? '✓' : ''}</div>
                <span>{it.label}</span>
                <span className="rm" onClick={(e) => { e.stopPropagation(); removeCustom(it.key) }}>×</span>
              </div>
            ))}
            <div className="item add" onClick={() => setAdding(true)}>
              <div className="box">+</div>
              <span>添加</span>
            </div>
          </div>
          <div className="note">维D / 肌醇 每日两次（早/晚），每日重置；自定义项长期保留</div>
          {adding && (
            <div className="add-form" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="自定义打卡项，如：喝水2L"
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              />
              <button className="btn" onClick={addCustom}>加</button>
            </div>
          )}
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
