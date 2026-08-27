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
    const raw = url.trim()
    const titleVal = title.trim()
    if (!raw && !titleVal) return
    // 从文本框里提取所有 http(s) 链接（支持一次粘贴多个，B站/抖音/短链都行）
    const urls = (raw + ' ' + titleVal).match(/https?:\/\/[^\s]+/g) || []
    const unique = [...new Set(urls)]
    setBusy(true)
    try {
      if (unique.length > 0) {
        const added = []
        let done = 0
        for (const u of unique) {
          const source = /bilibili|b23\.tv/i.test(u) ? 'bilibili' : 'douyin'
          const r = await api.favoritesAdd({ title: '', url: u, source })
          if (r.item) added.push(r.item)
          done++
          setMsg(`收录中 ${done}/${unique.length}…`)
        }
        if (added.length) setItems(it => [...added, ...it])
        setUrl(''); setTitle('')
        setMsg(added.length === unique.length
          ? `已收录 ${added.length} 条`
          : `已收录 ${added.length}/${unique.length} 条（部分失败）`)
      } else {
        // 没有链接：当作纯标题手动录入
        const r = await api.favoritesAdd({ title: titleVal, url: '', source: 'douyin' })
        if (r.item) setItems(it => [r.item, ...it])
        setUrl(''); setTitle('')
        setMsg('已收录 → ' + r.category)
      }
    } catch (e) {
      setMsg('失败：' + e.message)
    } finally { setBusy(false); setTimeout(() => setMsg(''), 3000) }
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

  function openItem(it) {
    if (it.url) window.open(it.url, '_blank')
    else alert('这条收藏没有可打开的链接')
  }

  const list = cat === '全部' ? items : items.filter(i => i.category === cat)

  return (
    <>
      <TopBar title="收藏夹" right={<button className="btn ghost sm" disabled={syncing} onClick={sync}>{syncing ? '同步中' : '同步B站'}</button>} />
      <div className="page">
        <div className="greeting" style={{ marginBottom: 10 }}>
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
          <div className="inbox-item" key={it.id} onClick={() => openItem(it)}>
            <div className="inbox-thumb" style={{ background: it.source === 'bilibili' ? '#FB7299' : '#161823' }}>{THUMB[it.source] || '🔗'}</div>
            <div className="inbox-main">
              <div className="t">{it.title}</div>
              <div className="meta">
                <span className="badge">{it.source === 'bilibili' ? 'B站' : '抖音'}</span>
                <span className={`cat-pill ${CAT_CLASS[it.category] || 'c-other'}`}>{it.category}</span>
                <span className="tl-del" onClick={(e) => { e.stopPropagation(); recat(it) }}>重分类</span>
              </div>
            </div>
            <span className="open">↗</span>
          </div>
        ))}
        {list.length === 0 && <p className="empty">这类还没有收藏～</p>}

        <div className="card tint" style={{ marginTop: 12 }}>
          <h3>➕ 粘贴链接收录</h3>
          <label>链接（B站 / 抖音 分享链接，可一次粘贴多个，每行一个）</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="粘贴 B站视频链接，或从收藏夹一次复制多个链接" />
          <label>标题（可选，留空自动识别）</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="视频标题（可留空）" />
          <button className="btn" disabled={busy} style={{ marginTop: 10 }} onClick={add}>{busy ? '收录中…' : '收录'}</button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>提示：B站自动同步暂时被平台风控拦截，用「粘贴链接」收录最稳，支持一次粘贴多个视频链接（含手机分享的 b23.tv 短链）。</p>
          {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
        </div>
      </div>
    </>
  )
}
