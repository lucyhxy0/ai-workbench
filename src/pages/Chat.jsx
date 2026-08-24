import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { api } from '../lib/api.js'

export default function Chat() {
  const [sessions, setSessions] = useState([])
  const [cur, setCur] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  async function loadSessions() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('chat_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setSessions(data || [])
    if (data?.length && !cur) openSession(data[0].id)
  }
  useEffect(() => { loadSessions() }, [])

  async function openSession(id) {
    setCur(id)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('chat_messages').select('*').eq('user_id', user.id).eq('session_id', id).order('created_at', { ascending: true })
    setMsgs(data || [])
  }

  async function newSession() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('chat_sessions').insert({ user_id: user.id, title: '新对话' }).select().single()
    await loadSessions(); openSession(data.id)
  }

  async function send() {
    if (!input.trim() || busy) return
    if (!cur) { await newSession(); return }
    const text = input.trim(); setInput(''); setBusy(true)
    const userMsg = { role: 'user', content: text }
    setMsgs(m => [...m, userMsg, { role: 'assistant', content: '' }])
    await supabase.from('chat_messages').insert({ user_id: (await supabase.auth.getUser()).data.user.id, session_id: cur, role: 'user', content: text })

    try {
      const res = await api.chatStream([...msgs.filter(m => m.content), userMsg].map(m => ({ role: m.role, content: m.content })))
      if (!res.ok) throw new Error('对话失败')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value)
        setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: acc }; return c })
      }
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('chat_messages').insert({ user_id: user.id, session_id: cur, role: 'assistant', content: acc })
      if (msgs.length === 0) await supabase.from('chat_sessions').update({ title: text.slice(0, 20) }).eq('id', cur)
      await loadSessions()
    } catch (e) {
      setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '⚠️ ' + e.message }; return c })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9 }) }, [msgs])

  return (
    <>
      <TopBar
        title="对话"
        right={<button className="btn ghost sm" onClick={newSession}>+新</button>}
      />
      <div className="page theme-chat" style={{ paddingBottom: 8, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {sessions.map(s => (
            <span key={s.id} className={`tag ${s.id === cur ? '' : ''}`} style={{ cursor: 'pointer', background: s.id === cur ? 'var(--primary)' : 'var(--bg-elev)', color: s.id === cur ? '#04201a' : 'var(--text)' }} onClick={() => openSession(s.id)}>
              {s.title.slice(0, 8)}
            </span>
          ))}
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
          {msgs.length === 0 && <div className="empty">开始和 AI 助手对话吧</div>}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>{m.content || '…'}</div>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'flex-end', paddingTop: 8 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="问点什么…（Enter 发送）" style={{ flex: 1, minHeight: 44, marginTop: 0 }} />
          <button className="btn" disabled={busy} onClick={send} style={{ width: 64 }}>{busy ? '…' : '发送'}</button>
        </div>
      </div>
    </>
  )
}
