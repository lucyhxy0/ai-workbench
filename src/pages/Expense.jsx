import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr } from '../lib/date.js'

const CATS = ['餐饮', '买菜', '交通', '居住', '医疗健康', '购物', '娱乐', '宠物', '其他']
const CAT_IC = {
  餐饮: '🍜', 买菜: '🥬', 交通: '🚌', 居住: '🏠', 医疗健康: '💊',
  购物: '🛍️', 娱乐: '🎮', 宠物: '🐱', 其他: '📦'
}

function money(n) {
  const v = Number(n) || 0
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function Expense() {
  const today = todayStr()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ date: today, amount: '', category: '餐饮', note: '' })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('expense')
      .select('*').eq('user_id', user.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(500)
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2200) }

  async function add() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { flash('请先登录'); return }
    const amt = Number(form.amount)
    if (!form.amount || isNaN(amt) || amt <= 0) { flash('填个金额吧～'); return }
    const { error } = await supabase.from('expense').insert({
      user_id: user.id, date: form.date, amount: amt,
      category: form.category, note: form.note.trim()
    })
    if (error) { flash('记录失败：' + error.message); return }
    setForm({ ...form, amount: '', note: '' })
    flash('已记一笔 ✓')
    await load()
  }

  async function del(id) {
    if (!window.confirm('删除这笔记录？')) return
    const { error } = await supabase.from('expense').delete().eq('id', id)
    if (error) { flash('删除失败：' + error.message); return }
    setRows(rs => rs.filter(r => r.id !== id))
    flash('已删除')
  }

  // 统计（本月 / 今日）
  const ym = today.slice(0, 7)
  const monthTotal = rows
    .filter(r => r.date.startsWith(ym))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const todayTotal = rows
    .filter(r => r.date === today)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <>
      <TopBar title="记账" />
      <div className="page">

        {/* 统计 */}
        <div className="card washi tint">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="sub">本月支出</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{money(monthTotal)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="sub">今日支出</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{money(todayTotal)}</div>
            </div>
          </div>
        </div>

        {/* 记一笔 */}
        <div className="card washi tint">
          <h3>➕ 记一笔</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: 140 }} />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATS.map(c => <option key={c} value={c}>{CAT_IC[c]} {c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="金额 ¥" style={{ flex: 1 }}
            />
            <button className="btn sm" onClick={add}>记</button>
          </div>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="备注（可选，如：午饭 / 超市采购）" style={{ marginTop: 10 }} />
        </div>

        {/* 明细 */}
        <div className="card tint">
          <h3>📒 支出明细</h3>
          {rows.length === 0 && <p className="sub">还没有记录，去上面记一笔吧～</p>}
          {rows.map(r => (
            <div key={r.id} className="check-row" style={{ borderBottom: '1px dashed var(--line)', alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>{CAT_IC[r.category] || '📦'}</span>
              <span className="label" style={{ minWidth: 70 }}>{r.category}</span>
              <span className="sub" style={{ flex: 1 }}>{r.date}{r.note ? ' · ' + r.note : ''}</span>
              <span style={{ fontWeight: 700, marginRight: 8 }}>{money(r.amount)}</span>
              <span
                style={{ color: '#e5484d', cursor: 'pointer', fontWeight: 800, fontSize: 15, padding: '2px 4px' }}
                onClick={() => del(r.id)} title="删除"
              >✕</span>
            </div>
          ))}
        </div>

        {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
      </div>
    </>
  )
}
