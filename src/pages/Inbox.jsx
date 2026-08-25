import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { api } from '../lib/api.js'
import TopBar from '../components/TopBar.jsx'

const CATS = ['猫', '经济股票', '乐高', '做饭', '听歌', '其他']
const CAT_CLASS = {
  '猫': 'c-cat', '经济股票': 'c-fin', '乐高': 'c-lego',
  '做饭': 'c-cook', '听歌': 'c-music', '其他': 'c-other'
}
const THUMB = { bilibili: '📺', douyin: '🎵' }

export default function Inbox() {
  const [items, setItems] = useState([])
  const [cat, setCat] = useState('全部')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setItems(data || [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    const t = title.trim() || url.trim()
    if (!t) return
    setBusy(true)
    try {
      const source = url.includes('bilibili') ? 'bilibili' : 'douyin'
      const r = await api.favoritesAdd({ title: t, url: url.trim(), source })
      if (r.item) setItems(it => [r.item, ...it])
      setUrl(''); setTitle(''); setMsg('已收录 → ' + r.category)
    } catch (e) {
      setMsg('失败：' + e.message)
    } finally { setBusy(false); setTimeout(() => setMsg(''), 2500) }
  }

  async function sync() {
    setSyncing(true); setMsg('B站同步中…')
    try {
      const r = await api.favoritesSync()
      await load()
      setMsg(`同步 ${r.synced} 条` + (r.note ? `（${r.note}）` : ''))
    } catch (e) {
      setMsg('同步失败：' + e.message)
    } finally { setSyncing(false); setTimeout(() => setMsg(''), 3000) }
  }

  async function recat(it) {
    const r = await api.favoritesRecat(it.id, it.title)
    setItems(lst => lst.map(x => x.id === it.id ? { ...x, category: r.category } : x))
  }

  const list = cat === '全部' ? items : items.filter(i => i.category === cat)

  return (
    <>
      <TopBar title="收藏夹" right={<button className="btn ghost sm" disabled={syncing} onClick={sync}>{syncing ? '同步中' : '同步B站'}</button>} />
      <div className="page">
        <div className="greeting" style={{ marginBottom: 10 }}>
          <div className="polaroid"><div className="ph">📥</div><div className="cap">My Inbox</div></div>
          <div>
            <div className="hi">AI Inbox,</div>
            <div className="name" style={{ fontSize: 30 }}>收藏夹</div>
            <div className="date">已收录 {items.length} 条</div>
          </div>
        </div>

        <div className="cat-bar">
          {['全部', ...CATS].map(c => (
            <span key={c} className={`cat-chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</span>
          ))}
        </div>

        {list.map(it => (
          <div className="inbox-item" key={it.id}>
            <div className="inbox-thumb" style={{ background: it.source === 'bilibili' ? '#FB7299' : '#161823' }}>{THUMB[it.source] || '🔗'}</div>
            <div className="inbox-main">
              <div className="t">{it.title}</div>
              <div className="meta">
                <span className="badge">{it.source === 'bilibili' ? 'B站' : '抖音'}</span>
                <span className={`cat-pill ${CAT_CLASS[it.category] || 'c-other'}`}>{it.category}</span>
                <span className="tl-del" onClick={() => recat(it)}>重分类</span>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="empty">这类还没有收藏～</p>}

        <div className="card tint" style={{ marginTop: 12 }}>
          <h3>➕ 粘贴链接收录</h3>
          <label>链接（抖音 / B站 分享链接）</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          <label>标题（可选，留空用链接代替）</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="视频标题" />
          <button className="btn" disabled={busy} style={{ marginTop: 10 }} onClick={add}>{busy ? '收录中…' : '收录'}</button>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>
      </div>
    </>
  )
}
