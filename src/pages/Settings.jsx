import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { api } from '../lib/api.js'
import { todayStr } from '../lib/date.js'

export default function Settings() {
  const nav = useNavigate()
  const [token, setToken] = useState('')
  const [parent, setParent] = useState('')
  const [tasks, setTasks] = useState([])
  const [f, setF] = useState({ name: '', day: 1, category: '财务', note: '' })
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setToken(localStorage.getItem('notion_token') || '')
    setParent(localStorage.getItem('notion_parent') || '')
    loadTasks()
  }, [])

  async function loadTasks() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('monthly_tasks').select('*').eq('user_id', user.id).eq('active', true).order('day_of_month')
    setTasks(data || [])
  }

  function saveNotion() {
    localStorage.setItem('notion_token', token.trim())
    localStorage.setItem('notion_parent', parent.trim())
    setMsg('Notion 配置已保存（本设备）')
    setTimeout(() => setMsg(''), 2000)
  }

  async function addTask() {
    if (!f.name.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('monthly_tasks').insert({ user_id: user.id, name: f.name.trim(), day_of_month: Number(f.day), category: f.category, note: f.note.trim() })
    setF({ name: '', day: 1, category: '财务', note: '' }); await loadTasks()
  }

  async function done(id) {
    await supabase.from('monthly_tasks').update({ last_done: todayStr() }).eq('id', id); await loadTasks()
  }
  async function remove(id) {
    await supabase.from('monthly_tasks').update({ active: false }).eq('id', id); await loadTasks()
  }

  async function sync() {
    if (!token.trim() || !parent.trim()) { setMsg('请先填写 Notion Token 和父页面 ID'); return }
    setSyncing(true); setMsg('同步中…')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user.id
      const t = todayStr()
      const [{ data: b }, { data: d }, { data: tr }, { data: mt }] = await Promise.all([
        supabase.from('briefings').select('*').eq('user_id', uid).eq('date', t).maybeSingle(),
        supabase.from('diet').select('*').eq('user_id', uid).eq('date', t).maybeSingle(),
        supabase.from('trading').select('*').eq('user_id', uid).eq('date', t).maybeSingle(),
        supabase.from('monthly_tasks').select('*').eq('user_id', uid).eq('active', true)
      ])
      await api.notionSync({
        token: token.trim(), parentPageId: parent.trim(),
        data: { date: t, briefing: b, diet: d, trading: tr, tasks: mt || [] }
      })
      setMsg('✅ 已同步到 Notion')
    } catch (e) { setMsg('❌ ' + e.message) }
    finally { setSyncing(false); setTimeout(() => setMsg(''), 3000) }
  }

  async function logout() {
    await supabase.auth.signOut(); nav('/')
  }

  return (
    <>
      <TopBar title="设置" />
      <div className="page">
        <div className="card">
          <h3>🔗 Notion 同步</h3>
          <label>Integration Token</label>
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="ntn_..." type="password" />
          <label>父页面 ID（数据写入到此页面下）</label>
          <input value={parent} onChange={e => setParent(e.target.value)} placeholder="Notion 页面 URL 末尾的 32 位 ID" />
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={saveNotion}>保存配置</button>
          <button className="btn" style={{ marginTop: 8 }} disabled={syncing} onClick={sync}>{syncing ? '同步中…' : '立即同步今日数据'}</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
          <p className="sub" style={{ fontSize: 11, marginTop: 6 }}>
            创建 Integration：notion.so/my-integrations → 复制 Token；在目标页面右上角 ··· → 连接应用，选你的 Integration。
          </p>
        </div>

        <div className="card">
          <h3>📅 月度固定事务</h3>
          {tasks.map(t => (
            <div key={t.id} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{t.name}</div>
                <div className="sub">每月 {t.day_of_month} 号 · {t.category}{t.note ? ` · ${t.note}` : ''}{t.last_done ? ` · 上次 ${t.last_done}` : ''}</div>
              </div>
              <button className="btn ghost sm" onClick={() => done(t.id)}>完成</button>
              <button className="btn danger sm" onClick={() => remove(t.id)}>删</button>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <label>名称</label>
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="如：还信用卡" />
            <div className="row">
              <div>
                <label>每月几号(1-28)</label>
                <input type="number" min={1} max={28} value={f.day} onChange={e => setF({ ...f, day: e.target.value })} />
              </div>
              <div>
                <label>分类</label>
                <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
                  <option>财务</option><option>宠物</option><option>健康</option><option>其他</option>
                </select>
              </div>
            </div>
            <label>备注</label>
            <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="可选" />
            <button className="btn" style={{ marginTop: 8 }} onClick={addTask}>添加事务</button>
          </div>
        </div>

        <button className="btn ghost" style={{ marginTop: 8 }} onClick={logout}>退出登录</button>
      </div>
    </>
  )
}
