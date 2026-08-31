import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr } from '../lib/date.js'

// 固定待办模板：按「最近一次记录」自动顺延下次到期
const TASKS = [
  { key: '外驱', period: 30, group: '每月', ic: '🛡️' },
  { key: '去毛', period: 30, group: '每月', ic: '🪮' },
  { key: '换猫砂', period: 30, group: '每月', ic: '🚽' },
  { key: '化毛膏', period: 30, group: '每月', ic: '💊' },
  { key: '剪指甲', period: 30, group: '每月', ic: '✂️' },
  { key: '内驱', period: 90, group: '每季', ic: '🐛' }
]
const CATS = ['化毛膏', '去毛', '剪指甲', '外驱', '换猫砂', '内驱', '喂食', '体重', '洗澡', '就医', '其他']

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00')
  return Math.round((db - da) / 86400000)
}

export default function Pet() {
  const today = todayStr()
  const [logs, setLogs] = useState([])
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ date: today, category: '化毛膏', note: '', weight: '' })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('pet_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(120)
    setLogs(data || [])
  }
  useEffect(() => { load() }, [])

  // 每个类别最近一次记录日期
  const lastByCat = {}
  for (const l of logs) {
    if (!lastByCat[l.category] || l.date > lastByCat[l.category]) lastByCat[l.category] = l.date
  }

  function statusOf(t) {
    const last = lastByCat[t.key]
    if (!last) return { cls: 'red', text: '还没做过' }
    const next = addDays(last, t.period)
    const left = daysBetween(today, next)
    if (left <= 0) return { cls: 'red', text: `逾期 ${-left} 天` }
    if (left <= 7) return { cls: 'amber', text: `剩 ${left} 天` }
    return { cls: 'green', text: `剩 ${left} 天` }
  }

  async function markDone(t) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('pet_logs').insert({ user_id: user.id, date: today, category: t.key, note: '完成' })
    setMsg(`${t.key} 已记录 ✓ 下次约 ${addDays(today, t.period)}`)
    await load()
    setTimeout(() => setMsg(''), 2200)
  }

  async function addLog() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (!form.note.trim() && form.weight === '') { setMsg('写点内容或填体重吧～'); setTimeout(() => setMsg(''), 2200); return }
    const row = { user_id: user.id, date: form.date, category: form.category, note: form.note.trim() }
    if (form.weight !== '') row.weight = Number(form.weight)
    await supabase.from('pet_logs').insert(row)
    setForm({ ...form, note: '', weight: '' })
    setMsg('已记录 ✓')
    await load()
    setTimeout(() => setMsg(''), 2200)
  }

  const monthTasks = TASKS.filter(t => t.group === '每月')
  const quarterTasks = TASKS.filter(t => t.group === '每季')

  return (
    <>
      <TopBar title="宠物 · Tobey" />
      <div className="page theme-pet">
        {/* 档案卡 */}
        <div className="card washi tint" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/icons/icon-192.png" alt="Tobey" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover' }} />
          <div>
            <h3 style={{ margin: 0 }}>🐱 Tobey</h3>
            <p className="sub" style={{ margin: '4px 0 0' }}>你的猫主子 · 英短</p>
          </div>
        </div>

        {/* 自动待办 */}
        <div className="card tint">
          <h3>🔔 自动待办</h3>
          <p className="sub" style={{ marginTop: -4 }}>每记录一次，自动顺延下次到期</p>

          <div style={{ fontSize: 13, color: 'var(--ink-dim)', fontWeight: 700, margin: '10px 0 2px' }}>每月</div>
          {monthTasks.map(t => {
            const s = statusOf(t)
            return (
              <div className="check-row" key={t.key}>
                <span style={{ fontSize: 18 }}>{t.ic}</span>
                <span className="label">{t.key}</span>
                <span className={`tag ${s.cls}`}>{s.text}</span>
                <button className="btn ghost sm" onClick={() => markDone(t)}>完成</button>
              </div>
            )
          })}

          <div style={{ fontSize: 13, color: 'var(--ink-dim)', fontWeight: 700, margin: '12px 0 2px' }}>每季（90天）</div>
          {quarterTasks.map(t => {
            const s = statusOf(t)
            return (
              <div className="check-row" key={t.key}>
                <span style={{ fontSize: 18 }}>{t.ic}</span>
                <span className="label">{t.key}</span>
                <span className={`tag ${s.cls}`}>{s.text}</span>
                <button className="btn ghost sm" onClick={() => markDone(t)}>完成</button>
              </div>
            )
          })}
        </div>

        {/* 添加记录 */}
        <div className="card washi tint">
          <h3>➕ 添加记录</h3>
          <label>日期</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <label style={{ marginTop: 10 }}>类别</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>内容</label>
          <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="如：喂了化毛膏 / 去毛一次 / 剪指甲" />
          <label style={{ marginTop: 10 }}>体重 (kg，可选)</label>
          <input type="number" inputMode="decimal" min="0" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="0" />
          <button className="btn" style={{ marginTop: 12 }} onClick={addLog}>确认记录</button>
        </div>

        {/* 近期记录 */}
        <div className="card tint">
          <h3>📜 近期记录</h3>
          {logs.length === 0 && <p className="sub">暂无，去上面记一条吧～</p>}
          {logs.map(l => (
            <div key={l.id} className="check-row" style={{ borderBottom: '1px dashed var(--line)' }}>
              <span className="label" style={{ fontSize: 13, minWidth: 82 }}>{l.date}</span>
              <span className="sub">{l.category}{l.note ? '：' + l.note : ''}{l.weight != null ? ` · ${l.weight}kg` : ''}</span>
            </div>
          ))}
        </div>

        {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
      </div>
    </>
  )
}
