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
const CARE_CATS = ['化毛膏', '去毛', '剪指甲', '外驱', '换猫砂', '内驱', '喂食', '体重', '洗澡', '就医', '其他']
const EXPENSE_CATS = ['主粮', '体检', '保险']
const EXP_IC = { 主粮: '🍚', 体检: '🏥', 保险: '📄' }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00')
  return Math.round((db - da) / 86400000)
}
function money(n) {
  const v = Number(n) || 0
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function Pet() {
  const today = todayStr()
  const [logs, setLogs] = useState([])
  const [latestWeight, setLatestWeight] = useState(null)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ date: today, category: '化毛膏', note: '', weight: '' })
  const [wInput, setWInput] = useState('')
  const [expForm, setExpForm] = useState({ date: today, category: '主粮', amount: '', note: '' })
  const [special, setSpecial] = useState({ date: today, note: '' })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('pet_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(200)
    setLogs(data || [])
    const { data: w } = await supabase.from('pet_logs')
      .select('date, weight').eq('user_id', user.id).eq('category', '体重')
      .not('weight', 'is', null).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setLatestWeight(w || null)
  }
  useEffect(() => { load() }, [])

  // 每个类别最近一次记录日期
  const lastByCat = {}
  for (const l of logs) {
    if (!lastByCat[l.category] || l.date > lastByCat[l.category]) lastByCat[l.category] = l.date
  }

  function statusOf(t) {
    const last = lastByCat[t.key]
    if (!last) return { cls: 'red', text: '还没做过', done: false }
    const next = addDays(last, t.period)
    const left = daysBetween(today, next)
    if (left <= 0) return { cls: 'red', text: `逾期 ${-left} 天`, done: false, last }
    if (left <= 7) return { cls: 'amber', text: `剩 ${left} 天`, done: true, last }
    return { cls: 'green', text: `剩 ${left} 天`, done: true, last }
  }

  // 最新体重由 load() 单独查询（latestWeight state），不依赖全局 logs 排序

  // 重大支出
  const expenses = logs
    .filter(l => EXPENSE_CATS.includes(l.category) && l.amount != null && l.amount !== '')
    .sort((a, b) => b.date.localeCompare(a.date))
  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  // 特殊情况
  const specialLogs = logs
    .filter(l => l.category === '特殊情况')
    .sort((a, b) => b.date.localeCompare(a.date))

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2200) }

  async function markDone(t) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { flash('请先登录'); return }
    const rec = { user_id: user.id, date: today, category: t.key, note: '完成' }
    const { error } = await supabase.from('pet_logs').insert(rec)
    if (error) { flash('记录失败：' + error.message); return }
    // 乐观更新本地，立即反馈，不依赖整表 reload
    setLogs(ls => [{ id: 'tmp-' + Date.now(), ...rec }, ...ls])
    flash(`${t.key} 已记录 ✓ 下次约 ${addDays(today, t.period)}`)
    await load()
  }

  async function addWeight() {
    if (wInput === '' || Number(wInput) <= 0) { flash('先填体重～'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('pet_logs').insert({ user_id: user.id, date: today, category: '体重', note: '', weight: Number(wInput) })
    setWInput('')
    flash('体重已更新 ✓')
    await load()
  }

  async function addLog() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (!form.note.trim() && form.weight === '') { flash('写点内容或填体重吧～'); return }
    const row = { user_id: user.id, date: form.date, category: form.category, note: form.note.trim() }
    if (form.weight !== '') row.weight = Number(form.weight)
    await supabase.from('pet_logs').insert(row)
    setForm({ ...form, note: '', weight: '' })
    flash('已记录 ✓')
    await load()
  }

  async function addExpense() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amt = Number(expForm.amount)
    if (!expForm.amount || isNaN(amt) || amt <= 0) { flash('填个金额吧～'); return }
    await supabase.from('pet_logs').insert({
      user_id: user.id, date: expForm.date, category: expForm.category,
      note: expForm.note.trim(), amount: amt
    })
    setExpForm({ ...expForm, amount: '', note: '' })
    flash('支出已记录 ✓')
    await load()
  }

  async function addSpecial() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (!special.note.trim()) { flash('写点情况吧～'); return }
    await supabase.from('pet_logs').insert({
      user_id: user.id, date: special.date, category: '特殊情况', note: special.note.trim()
    })
    setSpecial({ ...special, note: '' })
    flash('已记录 ✓')
    await load()
  }

  const monthTasks = TASKS.filter(t => t.group === '每月')
  const quarterTasks = TASKS.filter(t => t.group === '每季')

  return (
    <>
      <TopBar title="宠物 · Tobey" />
      <div className="page theme-pet">

        {/* 体重（顶部） */}
        <div className="card washi tint">
          <h3>⚖️ 体重</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>
                {latestWeight ? `${latestWeight.weight}kg` : '—'}
              </div>
              <div className="sub">{latestWeight ? `最近 ${latestWeight.date}` : '暂无记录'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number" inputMode="decimal" min="0" step="0.1"
                value={wInput} onChange={e => setWInput(e.target.value)}
                placeholder="今天体重" style={{ width: 96 }}
              />
              <span className="sub">kg</span>
              <button className="btn sm" onClick={addWeight}>记</button>
            </div>
          </div>
        </div>

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
                <span className="label">
                  {t.key}
                  {s.done && <span className="done-date">完成于 {s.last}</span>}
                </span>
                <span className={`tag ${s.cls}`}>{s.text}</span>
                <div className={`checkbox ${s.done ? 'on' : ''}`} onClick={() => markDone(t)} title="点勾完成">{s.done ? '✓' : ''}</div>
              </div>
            )
          })}

          <div style={{ fontSize: 13, color: 'var(--ink-dim)', fontWeight: 700, margin: '12px 0 2px' }}>每季（90天）</div>
          {quarterTasks.map(t => {
            const s = statusOf(t)
            return (
              <div className="check-row" key={t.key}>
                <span style={{ fontSize: 18 }}>{t.ic}</span>
                <span className="label">
                  {t.key}
                  {s.done && <span className="done-date">完成于 {s.last}</span>}
                </span>
                <span className={`tag ${s.cls}`}>{s.text}</span>
                <div className={`checkbox ${s.done ? 'on' : ''}`} onClick={() => markDone(t)} title="点勾完成">{s.done ? '✓' : ''}</div>
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
            {CARE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>内容</label>
          <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="如：喂了化毛膏 / 去毛一次 / 剪指甲" />
          <label style={{ marginTop: 10 }}>体重 (kg，可选)</label>
          <input type="number" inputMode="decimal" min="0" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="0" />
          <button className="btn" style={{ marginTop: 12 }} onClick={addLog}>确认记录</button>
        </div>

        {/* 重大支出 */}
        <div className="card tint">
          <h3>💰 重大支出</h3>
          <p className="sub" style={{ marginTop: -4 }}>主粮 / 体检 / 保险</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} style={{ width: 140 }} />
            <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
              {EXPENSE_CATS.map(c => <option key={c} value={c}>{EXP_IC[c]} {c}</option>)}
            </select>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={expForm.amount}
              onChange={e => setExpForm({ ...expForm, amount: e.target.value })} placeholder="金额 ¥" style={{ width: 110 }} />
            <button className="btn sm" onClick={addExpense}>记一笔</button>
          </div>
          <input value={expForm.note} onChange={e => setExpForm({ ...expForm, note: e.target.value })} placeholder="备注（如：皇家成猫粮 10kg / 年度体检套餐）" style={{ marginTop: 0 }} />

          {expenses.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 4px', fontWeight: 700 }}>
                <span className="sub">累计支出</span>
                <span style={{ color: 'var(--ink)' }}>{money(totalExpense)}</span>
              </div>
              {expenses.map(e => (
                <div key={e.id} className="check-row" style={{ borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ fontSize: 16 }}>{EXP_IC[e.category] || '💰'}</span>
                  <span className="label" style={{ minWidth: 64 }}>{e.category}</span>
                  <span className="sub" style={{ flex: 1 }}>{e.date}{e.note ? ' · ' + e.note : ''}</span>
                  <span style={{ fontWeight: 700 }}>{money(e.amount)}</span>
                </div>
              ))}
            </>
          )}
          {expenses.length === 0 && <p className="sub">还没有支出记录</p>}
        </div>

        {/* 近期记录 */}
        <div className="card tint">
          <h3>📜 近期记录</h3>
          {logs.length === 0 && <p className="sub">暂无，去上面记一条吧～</p>}
          {logs.map(l => (
            <div key={l.id} className="check-row" style={{ borderBottom: '1px dashed var(--line)' }}>
              <span className="label" style={{ fontSize: 13, minWidth: 82 }}>{l.date}</span>
              <span className="sub">
                {l.category}{l.note ? '：' + l.note : ''}
                {l.weight != null && l.weight !== '' ? ` · ${l.weight}kg` : ''}
                {l.amount != null && l.amount !== '' ? ` · ${money(l.amount)}` : ''}
              </span>
            </div>
          ))}
        </div>

        {/* 特殊情况记录（最底部） */}
        <div className="card tint">
          <h3>⚠️ 特殊情况记录</h3>
          <p className="sub" style={{ marginTop: -4 }}>呕吐 / 软便 / 受伤 / 异常行为等</p>
          <textarea value={special.note} onChange={e => setSpecial({ ...special, note: e.target.value })}
            placeholder="描述当时情况，如：今晚吐了两次，精神尚可" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="date" value={special.date} onChange={e => setSpecial({ ...special, date: e.target.value })} style={{ width: 150 }} />
            <button className="btn" onClick={addSpecial}>记录</button>
          </div>
          {specialLogs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {specialLogs.map(s => (
                <div key={s.id} className="check-row" style={{ borderBottom: '1px dashed var(--line)', display: 'block' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.date}</div>
                  <div className="sub">{s.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
      </div>
    </>
  )
}
