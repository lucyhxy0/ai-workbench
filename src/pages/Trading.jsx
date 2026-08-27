import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth } from '../lib/date.js'
import { api } from '../lib/api.js'

function mondayOf(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return todayStr(d)
}

export default function Trading() {
  const today = todayStr()
  const [rec, setRec] = useState(null)
  const [history, setHistory] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [aiText, setAiText] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id
    let { data: d } = await supabase.from('trading').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('trading').insert({ user_id: uid, date: today }).select().single(); d = nd }
    setRec(d)
    const { data: h } = await supabase.from('trading').select('date,operations,review').eq('user_id', uid).order('date', { ascending: false }).limit(10)
    setHistory(h || [])
  }
  useEffect(() => { load() }, [])

  async function save(field, value) {
    if (!rec) return
    setRec({ ...rec, [field]: value })
    await supabase.from('trading').update({ [field]: value }).eq('id', rec.id)
  }

  async function analyze() {
    if (!rec?.operations && !rec?.review) { setMsg('请先填写操作或复盘'); return }
    setAnalyzing(true); setAiText('')
    try {
      const res = await api.chatStream([
        { role: 'system', content: '你是一位严谨的操盘教练。请根据用户的当日操作和复盘，给出简短、可执行的改进建议（不超过150字），聚焦纪律与风险。' },
        { role: 'user', content: `操作记录：${rec.operations || '无'}\n复盘笔记：${rec.review || '无'}` }
      ])
      if (!res.ok) throw new Error('分析失败')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setAiText(t => t + dec.decode(value))
      }
      await supabase.from('trading').update({ ai_analysis: aiText }).eq('id', rec.id)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  if (!rec) return <div className="empty">加载中…</div>

  return (
    <>
      <TopBar title="操盘" right={<span className="tag">{weekOfMonth()}周</span>} />
      <div className="page theme-trade">
        <div className="card washi tint">
          <h3>📈 {today} 操作记录</h3>
          <textarea value={rec.operations} onChange={e => save('operations', e.target.value)} placeholder="今日买卖、持仓变动、触发原因…" />
        </div>
        <div className="card tint">
          <h3>📝 今日复盘</h3>
          <textarea value={rec.review} onChange={e => save('review', e.target.value)} placeholder="执行了哪些计划？哪里没做好？情绪如何？" />
          <button className="btn" style={{ marginTop: 10 }} disabled={analyzing} onClick={analyze}>
            {analyzing ? 'AI 分析中…' : '✨ AI 辅助分析'}
          </button>
          {aiText && <div className="bubble ai" style={{ marginTop: 10, maxWidth: '100%' }}>{aiText}</div>}
        </div>
        <div className="card tint">
          <h3>📜 近期记录</h3>
          {history.map(h => (
            <div key={h.date} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="label" style={{ fontSize: 13 }}>{h.date}</span>
              <span className="sub" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.operations || h.review || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
