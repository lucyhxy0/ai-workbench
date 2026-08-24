import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login') // login | signup
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function handle(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('注册成功！请查收验证邮件后登录。')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', background: 'var(--cream)' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="polaroid" style={{ transform: 'rotate(-3deg)' }}>
          <div className="ph">🐱</div>
          <div className="cap">hi, I'm Lucy</div>
        </div>
        <h1 className="hand" style={{ margin: '14px 0 2px', fontSize: 44, color: 'var(--ink)' }}>Lucy</h1>
        <p className="muted" style={{ fontSize: 13 }}>数字人生手账 · 你的 AI 生活助手</p>
      </div>
      <form onSubmit={handle}>
        <label>邮箱</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        <label style={{ marginTop: 12, display: 'block' }}>密码（至少 6 位）</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required />
        <button className="btn" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册'}
        </button>
      </form>
      {msg && <p className="muted center" style={{ fontSize: 13, marginTop: 12 }}>{msg}</p>}
      <p className="center" style={{ marginTop: 16, fontSize: 13 }}>
        <a onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }} style={{ cursor: 'pointer' }}>
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </a>
      </p>
    </div>
  )
}
